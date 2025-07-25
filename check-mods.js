import axios from "axios";
import * as cheerio from "cheerio";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Configuration
const DELAY_BETWEEN_REQUESTS = 1000;
const MAX_RETRIES = 3;

// Function to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to extract version from a mod page
export function extractVersionFromHtml(html) {
  const $ = cheerio.load(html);

  // Main method: Specific HTML structure for Arma Reforger workshop
  const dtElements = $("dt");

  for (let i = 0; i < dtElements.length; i++) {
    const dt = $(dtElements[i]);
    const dtText = dt.text().trim();

    if (dtText === "Version") {
      const dd = dt.next("dd");
      if (dd.length > 0) {
        const versionText = dd.text().trim();
        const versionMatch = versionText.match(
          /^([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)$/
        );
        if (versionMatch) {
          return versionMatch[1];
        }
      }
    }
  }

  // Alternative patterns
  const patterns = [
    /<dt[^>]*>\s*Version\s*<\/dt>\s*<dd[^>]*>\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)\s*<\/dd>/gi,
    /Version<\/dt>\s*<dd[^>]*>([^<]*?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?))/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)];
    for (const match of matches) {
      const beforeMatch = html.substring(
        Math.max(0, match.index - 50),
        match.index
      );
      if (!beforeMatch.toLowerCase().includes("game")) {
        const versionText = match[1] || match[2];
        const versionMatch = versionText.match(
          /([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9]+)?)/
        );
        if (versionMatch) {
          return versionMatch[1];
        }
      }
    }
  }

  return null;
}

// Function to extract mod size from a mod page
export function extractSizeFromHtml(html) {
  const $ = cheerio.load(html);

  // Look for "Version size" field
  const dtElements = $("dt");

  for (let i = 0; i < dtElements.length; i++) {
    const dt = $(dtElements[i]);
    const dtText = dt.text().trim();

    if (dtText === "Version size") {
      const dd = dt.next("dd");
      if (dd.length > 0) {
        const sizeText = dd.text().trim();
        // Parse size in different formats (MB, KB, GB)
        const sizeMatch = sizeText.match(
          /([0-9,]+(?:\.[0-9]+)?)\s*(KB|MB|GB)/i
        );
        if (sizeMatch) {
          const size = parseFloat(sizeMatch[1].replace(/,/g, ""));
          const unit = sizeMatch[2].toUpperCase();

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
  }

  return 0;
}

// Function to extract dependencies from a mod page
export function extractDependenciesFromHtml(html) {
  const $ = cheerio.load(html);
  const dependencies = [];

  const dependenciesSection = $("h2").filter(function () {
    return $(this).text().trim().toLowerCase() === "dependencies";
  });

  if (dependenciesSection.length > 0) {
    const section = dependenciesSection.closest("section");
    const dependencyLinks = section.find('a[href*="/workshop/"]');

    dependencyLinks.each(function () {
      const href = $(this).attr("href");
      const name = $(this).text().trim();

      if (href && name) {
        const modIdMatch = href.match(/\/workshop\/([A-F0-9]+)/i);
        if (modIdMatch) {
          dependencies.push({
            modId: modIdMatch[1],
            name: name,
          });
        }
      }
    });
  }

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

// Function to handle mock data in development mode
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
      // Fallback to hardcoded mock data if file cannot be loaded
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
          currentVersion: mockResult.currentVersion,
          status: mockResult.status,
          message: mockResult.message,
          dependencies: mockResult.dependencies,
          dependencyCheck: mockResult.dependencyCheck,
          size: mockResult.size,
        };
      } else {
        // Fallback for mods not in mock data
        return {
          ...mod,
          currentVersion: mod.version,
          status: "up-to-date",
          message: "Up to date (mock)",
          dependencies: [],
          dependencyCheck: { missing: [], found: [], hasMissing: false },
          size: Math.random() * 100,
        };
      }
    });

    // Generate summary
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
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    const currentVersion = extractVersionFromHtml(response.data);
    const dependencies = extractDependenciesFromHtml(response.data);
    const size = extractSizeFromHtml(response.data);
    const dependencyCheck = checkDependencies(dependencies, configMods);

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
