import {
  makeRequest,
  extractDependenciesFromHtml,
  extractSizeFromHtml,
} from "./check-mods.js";

// Configuration
const DELAY_BETWEEN_REQUESTS = 1000;
const MAX_RETRIES = 3;

// Function to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to extract search results from HTML
export function extractSearchResultsFromHtml(html, searchTerm) {
  console.log(`Extracting search results for: ${searchTerm}`);
  console.log(`HTML length: ${html.length} characters`);
  console.log(`HTML preview (first 500 chars): ${html.substring(0, 500)}`);
  const results = [];

  // First, extract all mod IDs and names
  const workshopItemPatterns = [
    // Pattern 1: Look for workshop links with mod IDs (most reliable)
    /<a[^>]*href="[^"]*\/workshop\/([A-F0-9]{8,})"[^>]*>([^<]+)<\/a>/gi,

    // Pattern 2: Look for workshop URLs in any context
    /\/workshop\/([A-F0-9]{8,})/gi,

    // Pattern 3: Look for mod IDs in JSON data
    /"id":\s*"([A-F0-9]{8,})"[^}]*"name":\s*"([^"]+)"/gi,

    // Pattern 4: Look for mod data in script tags
    /<script[^>]*>.*?"modId":\s*"([A-F0-9]{8,})".*?"name":\s*"([^"]+)".*?<\/script>/gis,

    // Pattern 5: Look for the specific format used by Arma Reforger workshop
    /(\d+(?:\.\d+)?\s*(?:KB|MB|GB))\s*(\d+%)\s*([^by]+)\s*by\s*([^\n\r<]+)/gi,

    // Pattern 6: Look for mod names in the search results
    /([A-Z0-9_]+(?:\s+[A-Z0-9_]+)*)\s*by\s*([^\n\r<]+)/gi,
  ];

  for (let i = 0; i < workshopItemPatterns.length; i++) {
    const pattern = workshopItemPatterns[i];
    console.log(`Trying search pattern ${i + 1}:`, pattern.source);

    const matches = [...html.matchAll(pattern)];
    console.log(`Found ${matches.length} search matches for pattern ${i + 1}`);

    for (const match of matches) {
      let modId, name;

      if (i === 0) {
        // Pattern 1: workshop links with mod IDs
        modId = match[1];
        name = match[2] ? match[2].trim() : `Mod ${modId}`;
        console.log(`Found workshop link: ${name} (${modId})`);
      } else if (i === 1) {
        // Pattern 2: workshop URLs in any context
        modId = match[1];
        name = `Mod ${modId}`; // We'll need to get the real name later
        console.log(`Found workshop URL: ${modId}`);
      } else if (i === 2) {
        // Pattern 3: mod IDs in JSON data
        modId = match[1];
        name = match[2] ? match[2].trim() : `Mod ${modId}`;
        console.log(`Found JSON mod: ${name} (${modId})`);
      } else if (i === 3) {
        // Pattern 4: mod data in script tags
        modId = match[1];
        name = match[2] ? match[2].trim() : `Mod ${modId}`;
        console.log(`Found script mod: ${name} (${modId})`);
      } else if (i === 4) {
        // Pattern 5: size percentage modname by author
        const size = match[1];
        const percentage = match[2];
        name = match[3].trim();
        const author = match[4].trim();
        // Generate a temporary ID based on the name for now
        modId = name
          .replace(/[^A-F0-9]/gi, "")
          .substring(0, 8)
          .toUpperCase();
        console.log(`Found mod: ${name} by ${author} (${size}, ${percentage})`);
      } else if (i === 5) {
        // Pattern 6: modname by author
        name = match[1].trim();
        const author = match[2].trim();
        modId = name
          .replace(/[^A-F0-9]/gi, "")
          .substring(0, 8)
          .toUpperCase();
        console.log(`Found mod: ${name} by ${author}`);
      }

      // Filter out invalid mod IDs and duplicates
      if (
        modId &&
        modId.length >= 4 &&
        !results.some((r) => r.modId === modId) &&
        name !== "Info" &&
        name !== "Workshop" &&
        name !== "Home" &&
        name !== "Search" &&
        name !== "Browse" &&
        !name.includes("Mod ") &&
        !name.includes("mod ") &&
        name.length > 0 &&
        name.length < 200 // Reasonable name length
      ) {
        console.log(`Found search result: ${name} (${modId})`);
        results.push({
          modId,
          name,
          searchTerm,
        });
      }
    }
  }

  // Now extract images for each found mod
  console.log(`Extracting images for ${results.length} mods...`);

  // First, try to extract images from JSON data (most reliable)
  try {
    const nextDataPattern =
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]*)<\/script>/gi;
    const nextDataMatches = [...html.matchAll(nextDataPattern)];

    for (const match of nextDataMatches) {
      try {
        const jsonData = JSON.parse(match[1]);
        console.log("Successfully parsed __NEXT_DATA__ JSON for images");

        // Look for mods data in the JSON
        const pageProps = jsonData?.props?.pageProps;
        if (pageProps) {
          // Try different paths for mods with images
          const modsPaths = [
            pageProps.mods,
            pageProps.assets,
            pageProps.searchResults,
            pageProps.workshopItems,
            pageProps.items,
          ];

          for (const mods of modsPaths) {
            if (mods && Array.isArray(mods)) {
              console.log(
                `Found ${mods.length} mods in JSON for image extraction`
              );

              for (const mod of mods) {
                if (mod.id) {
                  const existingResult = results.find(
                    (r) => r.modId === mod.id
                  );
                  if (existingResult) {
                    // Try different image fields
                    const imageUrl =
                      mod.imageUrl ||
                      mod.thumbnail ||
                      mod.preview ||
                      mod.image ||
                      mod.cover ||
                      mod.thumb;
                    if (imageUrl) {
                      existingResult.imageUrl = imageUrl;
                      console.log(
                        `Found image for ${existingResult.name}: ${imageUrl}`
                      );
                    } else if (mod.src) {
                      // Sometimes the image URL is in a 'src' field
                      existingResult.imageUrl = mod.src;
                      console.log(
                        `Found image for ${existingResult.name} in src field: ${mod.src}`
                      );
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.log(
          `Failed to parse __NEXT_DATA__ JSON for images: ${e.message}`
        );
      }
    }
  } catch (e) {
    console.log(`Error extracting images from JSON: ${e.message}`);
  }

  // Also try to extract all bistudio CDN images from HTML and associate them with mods
  try {
    // First try the pattern with alt text
    const bistudioImagePattern =
      /<img[^>]*src="(https:\/\/ar-gcp-cdn\.bistudio\.com\/[^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi;
    const bistudioMatches = [...html.matchAll(bistudioImagePattern)];

    console.log(
      `Found ${bistudioMatches.length} bistudio CDN images in HTML with alt text`
    );

    // Create a map of alt text to image URL
    const altTextToImage = new Map();
    for (const match of bistudioMatches) {
      const imageUrl = match[1];
      const altText = match[2];
      altTextToImage.set(altText, imageUrl);
    }

    // Associate images with mods by name
    for (const result of results) {
      if (!result.imageUrl) {
        for (const [altText, imageUrl] of altTextToImage) {
          if (altText.toLowerCase().includes(result.name.toLowerCase())) {
            result.imageUrl = imageUrl;
            console.log(
              `Matched image for ${result.name} by alt text: ${imageUrl}`
            );
            break;
          }
        }
      }
    }

    // If no matches found, try a simpler pattern to get all bistudio images
    if (bistudioMatches.length === 0) {
      const simpleBistudioPattern =
        /<img[^>]*src="(https:\/\/ar-gcp-cdn\.bistudio\.com\/[^"]*)"[^>]*>/gi;
      const simpleMatches = [...html.matchAll(simpleBistudioPattern)];

      console.log(
        `Found ${simpleMatches.length} bistudio CDN images in HTML (simple pattern)`
      );

      // Assign images to mods in order
      for (let i = 0; i < Math.min(simpleMatches.length, results.length); i++) {
        if (!results[i].imageUrl) {
          const imageUrl = simpleMatches[i][1];
          results[i].imageUrl = imageUrl;
          console.log(
            `Assigned image ${i + 1} to ${results[i].name}: ${imageUrl}`
          );
        }
      }
    }
  } catch (e) {
    console.log(`Error extracting bistudio images from HTML: ${e.message}`);
  }

  // For mods without images from JSON, try HTML patterns
  for (const result of results) {
    if (!result.imageUrl) {
      // Look for images near the mod ID in the HTML
      const imagePatterns = [
        // Pattern 1: Look for img tags near workshop links with the specific mod ID
        new RegExp(
          `<a[^>]*href="[^"]*\\/workshop\\/${result.modId}"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*>`,
          "gis"
        ),
        // Pattern 2: Look for img tags in the same container as the mod
        new RegExp(
          `<div[^>]*>.*?\\/workshop\\/${result.modId}.*?<img[^>]*src="([^"]*)"[^>]*>`,
          "gis"
        ),
        // Pattern 3: Look for any img tag with the mod ID in the same area
        new RegExp(
          `\\/workshop\\/${result.modId}.*?<img[^>]*src="([^"]*)"[^>]*>`,
          "gis"
        ),
        // Pattern 4: Look for img tags with alt text matching the mod name and extract URL
        new RegExp(
          `<img[^>]*alt="[^"]*${result.name.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[^"]*"[^>]*src="([^"]*)"[^>]*>`,
          "gis"
        ),
        // Pattern 5: Look for any img tag with bistudio CDN URL near the mod
        new RegExp(
          `\\/workshop\\/${result.modId}.*?<img[^>]*src="(https://ar-gcp-cdn\\.bistudio\\.com[^"]*)"[^>]*>`,
          "gis"
        ),
        // Pattern 6: Look for img tags with alt text and extract URL from src
        new RegExp(
          `<img[^>]*alt="[^"]*${result.name.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}[^"]*"[^>]*src="([^"]*)"[^>]*>`,
          "gis"
        ),
      ];

      for (const pattern of imagePatterns) {
        const imageMatch = html.match(pattern);
        if (imageMatch && imageMatch[1]) {
          // Extract just the URL from the src attribute
          let imageUrl = imageMatch[1].trim();

          // If the match contains the full img tag, extract just the src URL
          if (imageUrl.startsWith("<img")) {
            const srcMatch = imageUrl.match(/src="([^"]*)"/);
            if (srcMatch) {
              imageUrl = srcMatch[1];
            }
          }

          result.imageUrl = imageUrl;
          console.log(`Found image for ${result.name}: ${imageUrl}`);
          break;
        }
      }

      // If still no image found, try to find any bistudio CDN image in the HTML
      if (!result.imageUrl) {
        // Look for any bistudio CDN image URL in the HTML
        const bistudioImagePattern =
          /<img[^>]*src="(https:\/\/ar-gcp-cdn\.bistudio\.com\/[^"]*)"[^>]*>/gi;
        const bistudioMatches = [...html.matchAll(bistudioImagePattern)];

        if (bistudioMatches.length > 0) {
          // Use the first bistudio image found as a fallback
          const imageUrl = bistudioMatches[0][1];
          result.imageUrl = imageUrl;
          console.log(
            `Using fallback bistudio image for ${result.name}: ${imageUrl}`
          );
        } else {
          // Last resort: try to construct a default image URL based on mod ID
          const defaultImageUrl = `https://reforger.armaplatform.com/workshop/${result.modId}/preview`;
          result.imageUrl = defaultImageUrl;
          console.log(
            `Using default image URL for ${result.name}: ${defaultImageUrl}`
          );
        }
      }
    }
  }

  // If no results found with patterns, try to extract from JSON data
  if (results.length === 0) {
    console.log("No results found with patterns, trying JSON extraction...");

    // Look for __NEXT_DATA__ script
    const nextDataPattern =
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]*)<\/script>/gi;
    const nextDataMatches = [...html.matchAll(nextDataPattern)];

    for (const match of nextDataMatches) {
      try {
        const jsonData = JSON.parse(match[1]);
        console.log("Successfully parsed __NEXT_DATA__ JSON");

        // Navigate through the JSON structure to find mods
        const pageProps = jsonData?.props?.pageProps;
        if (pageProps) {
          // Try different paths for mods
          const modsPaths = [
            pageProps.mods,
            pageProps.assets,
            pageProps.searchResults,
            pageProps.workshopItems,
          ];

          for (const mods of modsPaths) {
            if (mods && Array.isArray(mods)) {
              console.log(`Found ${mods.length} mods in JSON`);
              mods.forEach((mod) => {
                if (
                  mod.id &&
                  mod.name &&
                  !results.some((r) => r.modId === mod.id)
                ) {
                  console.log(`Found JSON mod: ${mod.name} (${mod.id})`);
                  results.push({
                    modId: mod.id,
                    name: mod.name,
                    searchTerm,
                    imageUrl:
                      mod.imageUrl || mod.thumbnail || mod.preview || null,
                  });
                }
              });
            }
          }
        }
      } catch (e) {
        console.log(`Failed to parse __NEXT_DATA__ JSON: ${e.message}`);
      }
    }
  }

  console.log(`Total search results found: ${results.length}`);
  return results;
}

// Function to get version and dependencies for a mod
async function getModVersion(modId) {
  try {
    const url = `https://reforger.armaplatform.com/workshop/${modId}`;
    console.log(`Getting version for mod ${modId} from: ${url}`);

    const response = await makeRequest(url);

    if (response.status !== 200) {
      console.log(
        `Failed to get version for ${modId}: HTTP ${response.status}`
      );
      return { version: "Unknown", dependencies: [], size: 0 };
    }

    // Extract dependencies and size from the main page
    const dependencies = extractDependenciesFromHtml(response.data);
    const size = extractSizeFromHtml(response.data);
    console.log(`Found ${dependencies.length} dependencies for ${modId}`);
    console.log(`Found size for ${modId}: ${size} MB`);

    // Try to extract version from the main page first
    const versionPatterns = [
      /<dt[^>]*>\s*Version\s*<\/dt>\s*<dd[^>]*>\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)\s*<\/dd>/gi,
      /Version<\/dt>\s*<dd[^>]*>([^<]*?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?))/gi,
      /Version[^>]*>([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/gi,
      /version[^>]*>([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/gi,
    ];

    for (const pattern of versionPatterns) {
      const matches = [...response.data.matchAll(pattern)];
      for (const match of matches) {
        const versionText = match[1] || match[2];
        if (versionText) {
          const versionMatch = versionText.match(
            /([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/
          );
          if (versionMatch) {
            console.log(`Found version for ${modId}: ${versionMatch[1]}`);
            return { version: versionMatch[1], dependencies, size };
          }
        }
      }
    }

    // If not found on main page, try changelog
    const changelogUrl = `https://reforger.armaplatform.com/workshop/${modId}/changelog`;
    console.log(`Trying changelog for version: ${changelogUrl}`);

    const changelogResponse = await makeRequest(changelogUrl);

    if (changelogResponse.status === 200) {
      // Look for version in changelog headings
      const changelogPattern =
        /<h[1-6][^>]*>([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/gi;
      const changelogMatches = [
        ...changelogResponse.data.matchAll(changelogPattern),
      ];

      for (const match of changelogMatches) {
        const versionText = match[1];
        if (versionText) {
          console.log(
            `Found version in changelog for ${modId}: ${versionText}`
          );
          return { version: versionText, dependencies, size };
        }
      }
    }

    console.log(`No version found for ${modId}`);
    return { version: "Unknown", dependencies, size };
  } catch (error) {
    console.error(`Error getting version for ${modId}:`, error.message);
    return { version: "Unknown", dependencies: [], size: 0 };
  }
}

// Function to search for a single mod
async function searchMod(searchTerm, retryCount = 0) {
  // Check if we're on Vercel for logging purposes only
  const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
  console.log(
    `Environment check: Vercel=${isVercel}, NODE_ENV=${process.env.NODE_ENV}`
  );
  // For testing purposes, use known mods if search fails
  const knownMods = {
    ACE: [
      { modId: "60C4CE4888FF4621", name: "ACE Core", version: "1.3.2" },
      { modId: "5DBD560C5148E1DA", name: "ACE Carrying", version: "1.3.2" },
    ],
    AMF: [
      { modId: "65D2BD1", name: "AMF - CORE", version: "1.0.3" },
      { modId: "62CCD69D", name: "AKI CORE", version: "3.0.4" },
    ],
    ARQUUS: [
      {
        modId: "65933C74B33C5B63",
        name: "7e LFE USSR Variant Insurgent",
        version: "1.0.1",
      },
    ],
    WCS: [{ modId: "WCSINVAS", name: "WCS_Invasion", version: "1.0.0" }],
  };

  // Temporarily disable known mods to force real scraping
  // const upperSearchTerm = searchTerm.toUpperCase();
  // for (const [key, mods] of Object.entries(knownMods)) {
  //   if (upperSearchTerm.includes(key)) {
  //     console.log(
  //       `Using known mods for search term "${searchTerm}": ${mods.length} mods found`
  //     );
  //     return {
  //       searchTerm,
  //       results: mods,
  //       totalFound: mods.length,
  //       status: "found",
  //       message: `Found ${mods.length} known mod(s)`,
  //     };
  //   }
  // }

  const encodedSearchTerm = encodeURIComponent(searchTerm);
  const url = `https://reforger.armaplatform.com/workshop?search=${encodedSearchTerm}`;

  console.log(`Searching for mod: "${searchTerm}" - Attempt ${retryCount + 1}`);
  console.log(`Making request to: ${url}`);

  try {
    const response = await makeRequest(url);

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(
      `Received search HTML response, length: ${response.data.length} characters`
    );
    console.log(
      `HTML preview (first 1000 chars):`,
      response.data.substring(0, 1000)
    );

    // Debug: Look for workshop links in the HTML
    const workshopLinks = response.data.match(/\/workshop\/[A-F0-9]+/g);
    console.log(
      `Found ${
        workshopLinks ? workshopLinks.length : 0
      } workshop links in HTML:`,
      workshopLinks ? workshopLinks.slice(0, 5) : []
    );

    // Debug: Look for common patterns that indicate the page loaded correctly
    const hasWorkshopContent = response.data.includes("workshop");
    const hasSearchResults =
      response.data.includes("search") || response.data.includes("result");
    console.log(`Page contains workshop content: ${hasWorkshopContent}`);
    console.log(`Page contains search results: ${hasSearchResults}`);

    const searchResults = extractSearchResultsFromHtml(
      response.data,
      searchTerm
    );

    // If there's exactly one result, get the version and dependencies automatically
    if (searchResults.length === 1) {
      const singleResult = searchResults[0];
      console.log(
        `Single result found for "${searchTerm}", getting version and dependencies...`
      );

      const versionData = await getModVersion(singleResult.modId);

      const modWithVersion = {
        modId: singleResult.modId,
        name: singleResult.name,
        version: versionData.version,
        dependencies: versionData.dependencies,
        size: versionData.size,
        imageUrl: singleResult.imageUrl,
      };

      return {
        searchTerm,
        results: [modWithVersion],
        totalFound: 1,
        status: "found",
        message: `Found 1 result with version ${versionData.version}`,
        hasMultipleResults: false,
      };
    }

    // For multiple results, don't get versions yet - let user choose first
    const modsWithVersions = searchResults.map((result) => ({
      modId: result.modId,
      name: result.name,
      version: "Unknown", // Will be filled when user selects
      imageUrl: result.imageUrl, // Include image URL for UI display
    }));

    return {
      searchTerm,
      results: modsWithVersions,
      totalFound: modsWithVersions.length,
      status: modsWithVersions.length > 0 ? "found" : "not_found",
      message:
        modsWithVersions.length > 0
          ? `Found ${modsWithVersions.length} result(s)`
          : "No results found",
      hasMultipleResults: modsWithVersions.length > 1,
    };
  } catch (error) {
    console.error(`Error searching for mod "${searchTerm}":`, error.message);
    console.error(`Error details:`, error);

    if (retryCount < MAX_RETRIES) {
      console.log(
        `Retrying search for "${searchTerm}" (${retryCount + 1}/${MAX_RETRIES})`
      );
      await delay(2000);
      return searchMod(searchTerm, retryCount + 1);
    }

    // Return empty results if search fails completely
    console.log(
      `Search failed completely for "${searchTerm}": ${error.message}`
    );

    return {
      searchTerm,
      results: [],
      totalFound: 0,
      status: "error",
      message: `Search failed: ${error.message}`,
      hasMultipleResults: false,
    };
  }
}

// API handler for getting mod version
async function getModVersionHandler(req, res) {
  console.log("Get Mod Version API handler called", {
    method: req.method,
    url: req.url,
  });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { modId } = req.body;

    if (!modId) {
      return res.status(400).json({ error: "modId is required" });
    }

    console.log(`Getting version for mod: ${modId}`);
    const result = await getModVersion(modId);

    res.json({
      modId: modId,
      version: result.version,
      dependencies: result.dependencies,
      size: result.size,
      success: true,
    });
  } catch (error) {
    console.error("Get Mod Version API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}

// Main API handler
export default async function handler(req, res) {
  console.log("Search API handler called", {
    method: req.method,
    url: req.url,
  });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Test connectivity to Arma Reforger API on first request
  const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV;
  if (isVercel) {
    console.log("Testing connectivity to Arma Reforger API...");
    try {
      const testResponse = await makeRequest(
        "https://reforger.armaplatform.com/workshop",
        {
          timeout: 10000,
        }
      );
      console.log(
        `Connectivity test successful: HTTP ${testResponse.status}, length: ${testResponse.data.length}`
      );
    } catch (error) {
      console.error("Connectivity test failed:", error.message);
    }
  }

  try {
    const { searchTerms, modId } = req.body;

    // Handle mod version request
    if (modId) {
      return await getModVersionHandler(req, res);
    }

    // Handle search request
    console.log("Received search terms:", searchTerms?.length || 0);

    if (!searchTerms || !Array.isArray(searchTerms)) {
      return res.status(400).json({ error: "Invalid searchTerms array" });
    }

    // Set headers for streaming response
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const allMods = [];
    const total = searchTerms.length;

    for (let i = 0; i < searchTerms.length; i++) {
      const searchTerm = searchTerms[i].trim();

      if (!searchTerm) continue;

      // Send progress update
      res.write(
        JSON.stringify({
          type: "progress",
          current: i + 1,
          total: total,
          searchTerm: searchTerm,
        }) + "\n"
      );

      const result = await searchMod(searchTerm);

      // If multiple results found, send them for user selection
      if (result.hasMultipleResults) {
        res.write(
          JSON.stringify({
            type: "multiple_results",
            searchTerm: searchTerm,
            results: result.results,
            totalFound: result.totalFound,
          }) + "\n"
        );
        // Don't add to allMods yet, wait for user selection
        continue;
      }

      // Add found mods to the main array (single result or no results)
      if (result.results && result.results.length > 0) {
        allMods.push(...result.results);
      }

      // Wait between requests
      if (i < searchTerms.length - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    }

    // Generate the final JSON response in the requested format
    const finalResponse = {
      type: "complete",
      timestamp: new Date().toISOString(),
      mods: allMods,
    };

    // Send final results
    res.write(JSON.stringify(finalResponse) + "\n");
    res.end();
  } catch (error) {
    console.error("Search API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
