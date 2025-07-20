import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Configuration
const DELAY_BETWEEN_REQUESTS = 1000;
const MAX_RETRIES = 3;

// Function to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple HTTP client using native Node.js
export async function makeRequest(url, options = {}) {
  const { protocol, hostname, port, pathname, search } = new URL(url);
  const isHttps = protocol === "https:";

  const http = isHttps ? await import("https") : await import("http");
  const zlib = await import("zlib");

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port: port || (isHttps ? 443 : 80),
        path: pathname + search,
        method: options.method || "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Cache-Control": "no-cache",
          ...options.headers,
        },
        timeout: options.timeout || 30000,
      },
      (res) => {
        let data = "";

        // Handle compression
        let stream = res;
        const contentEncoding = res.headers["content-encoding"];

        if (contentEncoding === "gzip") {
          stream = res.pipe(zlib.createGunzip());
        } else if (contentEncoding === "deflate") {
          stream = res.pipe(zlib.createInflate());
        } else if (contentEncoding === "br") {
          stream = res.pipe(zlib.createBrotliDecompress());
        }

        stream.on("data", (chunk) => (data += chunk));
        stream.on("end", () => {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers,
          });
        });
        stream.on("error", reject);
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.data) {
      req.write(options.data);
    }
    req.end();
  });
}

// Simple HTML parser using regex
export function extractVersionFromHtml(html) {
  console.log("Extracting version from HTML...");

  // Look for version pattern in HTML - multiple patterns to try
  const versionPatterns = [
    // Pattern 1: <dt>Version</dt><dd>1.2.3</dd>
    /<dt[^>]*>\s*Version\s*<\/dt>\s*<dd[^>]*>\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)\s*<\/dd>/gi,
    // Pattern 2: Version</dt><dd>1.2.3
    /Version<\/dt>\s*<dd[^>]*>([^<]*?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?))/gi,
    // Pattern 3: Version: 1.2.3
    /Version[^>]*>([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/gi,
    // Pattern 4: More flexible version pattern
    /version[^>]*>([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/gi,
    // Pattern 5: Look for version in any context
    /([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/g,
  ];

  for (let i = 0; i < versionPatterns.length; i++) {
    const pattern = versionPatterns[i];
    console.log(`Trying pattern ${i + 1}:`, pattern.source);

    const matches = [...html.matchAll(pattern)];
    console.log(`Found ${matches.length} matches for pattern ${i + 1}`);

    for (const match of matches) {
      const versionText = match[1] || match[2];
      console.log(`Match found:`, versionText);

      if (versionText) {
        const versionMatch = versionText.match(
          /([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/
        );
        if (versionMatch) {
          console.log(`Extracted version: ${versionMatch[1]}`);
          return versionMatch[1];
        }
      }
    }
  }

  console.log("No version found in HTML");
  return null;
}

// Function to extract mod size from HTML
export function extractSizeFromHtml(html) {
  console.log("Extracting size from HTML...");

  // Look for version size pattern in HTML
  const sizePatterns = [
    // Pattern 1: <dt>Version size</dt><dd>7.58 MB</dd>
    /<dt[^>]*>\s*Version size\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)\s*<\/dd>/gi,
    // Pattern 2: Version size: 7.58 MB
    /Version size[^>]*>([^<]+)/gi,
    // Pattern 3: Direct size pattern
    /([0-9,]+(?:\.[0-9]+)?)\s*(KB|MB|GB)/gi,
  ];

  for (let i = 0; i < sizePatterns.length; i++) {
    const pattern = sizePatterns[i];
    console.log(`Trying size pattern ${i + 1}:`, pattern.source);

    const matches = [...html.matchAll(pattern)];
    console.log(`Found ${matches.length} size matches for pattern ${i + 1}`);

    for (const match of matches) {
      const sizeText = match[1] || match[0];
      console.log(`Size match found:`, sizeText);

      // Parse size in different formats (MB, KB, GB)
      const sizeMatch = sizeText.match(/([0-9,]+(?:\.[0-9]+)?)\s*(KB|MB|GB)/i);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1].replace(/,/g, ""));
        const unit = sizeMatch[2].toUpperCase();

        console.log(`Parsed size: ${size} ${unit}`);

        // Convert to MB for consistency
        switch (unit) {
          case "KB":
            return size / 1024;
          case "MB":
            return size;
          case "GB":
            return size * 1024;
          default:
            return size;
        }
      }
    }
  }

  console.log("No size found in HTML");
  return 0;
}

// Function to extract dependencies from HTML
export function extractDependenciesFromHtml(html) {
  console.log("Extracting dependencies from HTML...");
  const dependencies = [];
  const seenModIds = new Set();

  // First, try to extract from the __NEXT_DATA__ script (most reliable)
  const nextDataPattern =
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]*)<\/script>/gi;
  const nextDataMatches = [...html.matchAll(nextDataPattern)];

  for (const match of nextDataMatches) {
    try {
      const jsonData = JSON.parse(match[1]);
      console.log("Successfully parsed __NEXT_DATA__ JSON");

      // Navigate through the JSON structure to find dependencies
      const pageProps = jsonData?.props?.pageProps;
      if (pageProps) {
        // Try different paths for dependencies
        const depsPaths = [
          pageProps.dependencies,
          pageProps.asset?.dependencies,
          pageProps.assetVersionDetail?.dependencies,
        ];

        for (const deps of depsPaths) {
          if (deps && Array.isArray(deps)) {
            console.log(`Found ${deps.length} dependencies in JSON`);
            deps.forEach((dep) => {
              if (
                dep.asset &&
                dep.asset.id &&
                dep.asset.name &&
                !seenModIds.has(dep.asset.id)
              ) {
                console.log(
                  `Found JSON dependency: ${dep.asset.name} (${dep.asset.id})`
                );
                dependencies.push({
                  modId: dep.asset.id,
                  name: dep.asset.name,
                });
                seenModIds.add(dep.asset.id);
              }
            });
          }
        }
      }
    } catch (e) {
      console.log(`Failed to parse __NEXT_DATA__ JSON: ${e.message}`);
    }
  }

  // Fallback: Look for individual dependency objects in the HTML
  const depObjectPattern = /"modId":\s*"([A-F0-9]+)"[^}]*"name":\s*"([^"]+)"/gi;
  const depMatches = [...html.matchAll(depObjectPattern)];

  for (const match of depMatches) {
    const modId = match[1];
    const name = match[2];
    if (modId && name && !seenModIds.has(modId)) {
      console.log(`Found HTML dependency: ${name} (${modId})`);
      dependencies.push({ modId, name });
      seenModIds.add(modId);
    }
  }

  // Last resort: Look for workshop links in HTML
  const workshopLinkPatterns = [
    // Pattern 1: Standard workshop links
    /<a[^>]*href="[^"]*\/workshop\/([A-F0-9]+)"[^>]*>([^<]+)<\/a>/gi,
    // Pattern 2: More flexible workshop links
    /href="[^"]*\/workshop\/([A-F0-9]+)"[^>]*>([^<]+)/gi,
  ];

  for (let i = 0; i < workshopLinkPatterns.length; i++) {
    const pattern = workshopLinkPatterns[i];
    console.log(`Trying workshop link pattern ${i + 1}:`, pattern.source);

    const matches = [...html.matchAll(pattern)];
    console.log(
      `Found ${matches.length} workshop link matches for pattern ${i + 1}`
    );

    for (const match of matches) {
      const modId = match[1];
      const name = match[2] ? match[2].trim() : `Mod ${modId}`;

      // Filter out invalid mod IDs, duplicates, and non-dependency links
      if (
        modId &&
        modId.length >= 8 &&
        !seenModIds.has(modId) &&
        name !== "Info" &&
        !name.includes("Mod ") &&
        name !== "Workshop" &&
        name !== "Home"
      ) {
        console.log(`Found workshop dependency: ${name} (${modId})`);
        dependencies.push({ modId, name });
        seenModIds.add(modId);
      }
    }
  }

  console.log(`Total unique dependencies found: ${dependencies.length}`);
  return dependencies;
}

// Function to check dependencies
function checkDependencies(modDependencies, configMods) {
  const configModIds = new Set(configMods.map((mod) => mod.modId));
  const missingDependencies = [];
  const foundDependencies = [];

  modDependencies.forEach((dep) => {
    if (configModIds.has(dep.modId)) {
      foundDependencies.push(dep);
    } else {
      missingDependencies.push(dep);
    }
  });

  return {
    missing: missingDependencies,
    found: foundDependencies,
    hasMissing: missingDependencies.length > 0,
  };
}

// Function to handle mock data
async function handleMockData(req, res, mods) {
  try {
    // Load mock data from external JSON file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const mockDataPath = join(__dirname, "mock-data.json");
    let mockResults = [];

    try {
      const mockDataContent = readFileSync(mockDataPath, "utf8");
      mockResults = JSON.parse(mockDataContent);
      console.log(
        `Loaded ${mockResults.length} mock mods from ${mockDataPath}`
      );
    } catch (fileError) {
      console.error("Error loading mock data file:", fileError.message);
      // Fallback to hardcoded mock data
      mockResults = [
        {
          modId: "65933C74B33C5B63",
          name: "7e LFE USSR Variant Insurgent",
          currentVersion: "1.0.2",
          status: "up-to-date",
          message: "Up to date",
          dependencies: [
            {
              modId: "64CEC8E005828E5D",
              name: "Middle East Insurgents",
            },
          ],
          dependencyCheck: {
            missing: [],
            found: [
              {
                modId: "64CEC8E005828E5D",
                name: "Middle East Insurgents",
              },
            ],
            hasMissing: false,
          },
          size: 0.04095703125,
        },
        {
          modId: "60C4CE4888FF4621",
          name: "ACE Core",
          currentVersion: "1.3.2",
          status: "up-to-date",
          message: "Up to date",
          dependencies: [],
          dependencyCheck: {
            missing: [],
            found: [],
            hasMissing: false,
          },
          size: 7.58,
        },
      ];
    }

    // Set headers for streaming response
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const total = mods.length;

    // Simulate progress updates
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];

      // Send progress update
      res.write(
        JSON.stringify({
          type: "progress",
          current: i + 1,
          total: total,
          modName: mod.name,
        }) + "\n"
      );

      // Simulate delay like real API
      await delay(100);
    }

    // Find matching mock data for the requested mods
    const results = mods.map((mod) => {
      const mockResult = mockResults.find((mock) => mock.modId === mod.modId);
      if (mockResult) {
        return {
          ...mod,
          ...mockResult,
        };
      }
      return {
        ...mod,
        currentVersion: "MOCK_NOT_FOUND",
        status: "error",
        message: "Mock data not found",
        dependencies: [],
        dependencyCheck: { missing: [], found: [], hasMissing: false },
        size: 0,
      };
    });

    // Generate final summary
    const upToDate = results.filter((r) => r.status === "up-to-date");
    const outdated = results.filter((r) => r.status === "outdated");
    const missingDeps = results.filter((r) => r.status === "missing-deps");
    const outdatedMissingDeps = results.filter(
      (r) => r.status === "outdated-missing-deps"
    );
    const errors = results.filter((r) => r.status === "error");

    const finalResponse = {
      type: "complete",
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        upToDate: upToDate.length,
        outdated: outdated.length,
        missingDepsOnly: missingDeps.length,
        outdatedMissingDeps: outdatedMissingDeps.length,
        errors: errors.length,
      },
      results: results,
    };

    // Send final results
    res.write(JSON.stringify(finalResponse) + "\n");
    res.end();
  } catch (error) {
    console.error("Mock data error:", error);
    res.status(500).json({ error: "Mock data error", details: error.message });
  }
}

// Function to check a single mod
async function checkMod(mod, configMods, retryCount = 0) {
  const url = `https://reforger.armaplatform.com/workshop/${mod.modId}`;
  console.log(
    `Checking mod: ${mod.name} (${mod.modId}) - Attempt ${retryCount + 1}`
  );

  try {
    console.log(`Making request to: ${url}`);
    const response = await makeRequest(url);

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(
      `Received HTML response, length: ${response.data.length} characters`
    );
    console.log(
      `HTML preview (first 500 chars):`,
      response.data.substring(0, 500)
    );

    const currentVersion = extractVersionFromHtml(response.data);
    const size = extractSizeFromHtml(response.data);
    const dependencies = extractDependenciesFromHtml(response.data);
    const dependencyCheck = checkDependencies(dependencies, configMods);

    console.log(`Results for ${mod.name}:`);
    console.log(`- Version found: ${currentVersion}`);
    console.log(`- Size found: ${size} MB`);
    console.log(`- Dependencies found: ${dependencies.length}`);

    if (!currentVersion) {
      return {
        ...mod,
        currentVersion: "VERSION_NOT_FOUND",
        status: "error",
        message: "Unable to find version on page",
        dependencies: dependencies,
        dependencyCheck: dependencyCheck,
      };
    }

    const isUpToDate = currentVersion === mod.version;
    let status = isUpToDate ? "up-to-date" : "outdated";
    let message = isUpToDate
      ? "Up to date"
      : `Version mismatch: ${mod.version} -> ${currentVersion}`;

    if (dependencyCheck.hasMissing) {
      status =
        status === "up-to-date" ? "missing-deps" : "outdated-missing-deps";
      const missingNames = dependencyCheck.missing
        .map((dep) => dep.name)
        .join(", ");
      message += ` | Missing dependencies: ${missingNames}`;
    }

    return {
      ...mod,
      currentVersion,
      status,
      message,
      dependencies: dependencies,
      dependencyCheck: dependencyCheck,
      size: size,
    };
  } catch (error) {
    console.error(`Error checking mod ${mod.name}:`, error.message);

    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying ${mod.name} (${retryCount + 1}/${MAX_RETRIES})`);
      await delay(2000);
      return checkMod(mod, configMods, retryCount + 1);
    }

    return {
      ...mod,
      currentVersion: "ERROR",
      status: "error",
      message: `Error: ${error.message}`,
      dependencies: [],
      dependencyCheck: { missing: [], found: [], hasMissing: false },
      size: 0,
    };
  }
}

// Main API handler
export default async function handler(req, res) {
  console.log("API handler called", { method: req.method, url: req.url });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mods } = req.body;
    console.log("Received mods:", mods?.length || 0);

    if (!mods || !Array.isArray(mods)) {
      return res.status(400).json({ error: "Invalid mods array" });
    }

    // Check if we're in development mode or if we want to force mock data
    const isDevMode =
      process.env.NODE_ENV === "development" ||
      process.env.DEV_MODE === "true" ||
      process.env.USE_MOCK_DATA === "true";

    console.log("Environment check:", {
      NODE_ENV: process.env.NODE_ENV,
      DEV_MODE: process.env.DEV_MODE,
      USE_MOCK_DATA: process.env.USE_MOCK_DATA,
      isDevMode,
    });

    if (isDevMode) {
      console.log("🔧 Development mode: Using mock data");
      return handleMockData(req, res, mods);
    }

    console.log("🚀 Production mode: Using real Arma Reforger API");

    // Set headers for streaming response
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const results = [];
    const total = mods.length;

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];

      // Send progress update
      res.write(
        JSON.stringify({
          type: "progress",
          current: i + 1,
          total: total,
          modName: mod.name,
        }) + "\n"
      );

      const result = await checkMod(mod, mods);
      results.push(result);

      // Wait between requests
      if (i < mods.length - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    }

    // Generate final summary
    const upToDate = results.filter((r) => r.status === "up-to-date");
    const outdated = results.filter((r) => r.status === "outdated");
    const missingDeps = results.filter((r) => r.status === "missing-deps");
    const outdatedMissingDeps = results.filter(
      (r) => r.status === "outdated-missing-deps"
    );
    const errors = results.filter((r) => r.status === "error");

    const finalResponse = {
      type: "complete",
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        upToDate: upToDate.length,
        outdated: outdated.length,
        missingDepsOnly: missingDeps.length,
        outdatedMissingDeps: outdatedMissingDeps.length,
        errors: errors.length,
      },
      results: results,
    };

    // Send final results
    res.write(JSON.stringify(finalResponse) + "\n");
    res.end();
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
