import axios from "axios";
import * as cheerio from "cheerio";

// Configuration
const DELAY_BETWEEN_REQUESTS = 1000;
const MAX_RETRIES = 3;

// Function to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to extract version from a mod page
function extractVersionFromHtml(html) {
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

// Function to extract dependencies from a mod page
function extractDependenciesFromHtml(html) {
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

// Function to check a single mod
async function checkMod(mod, configMods, retryCount = 0) {
  const url = `https://reforger.armaplatform.com/workshop/${mod.modId}`;

  try {
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
      timeout: 15000,
    });

    const currentVersion = extractVersionFromHtml(response.data);
    const dependencies = extractDependenciesFromHtml(response.data);
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
    };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
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
    };
  }
}

// Main API handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { mods } = req.body;

    if (!mods || !Array.isArray(mods)) {
      return res.status(400).json({ error: "Invalid mods array" });
    }

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
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
}
