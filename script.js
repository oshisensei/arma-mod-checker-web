let configData = null;
let checkResults = null;
let pendingModSelections = new Map(); // Store pending selections for multiple results
let hasMultipleResults = false; // Track if we're in selection mode
let pendingSearchTerms = []; // Track which search terms need selection
let selectedMods = []; // Store all selected mods

// Tab switching functionality
function switchTab(tab) {
  document.getElementById("uploadTab").classList.remove("active");
  document.getElementById("pasteTab").classList.remove("active");
  document.getElementById("searchTab").classList.remove("active");
  document.getElementById(tab + "Tab").classList.add("active");

  document.getElementById("uploadSection").classList.remove("active");
  document.getElementById("pasteSection").classList.remove("active");
  document.getElementById("searchSection").classList.remove("active");
  document.getElementById(tab + "Section").classList.add("active");

  // Show/hide the Analyze Mods button based on the active tab
  const checkButton = document.getElementById("checkButton");
  if (tab === "search") {
    checkButton.style.display = "none";
  } else {
    checkButton.style.display = "inline-block";
  }

  // Hide results section when switching tabs
  document.getElementById("progressSection").style.display = "none";
  document.getElementById("resultsSection").style.display = "none";

  resetConfigState();
}

// Reset configuration state
function resetConfigState() {
  configData = null;
  document.getElementById("fileInfo").style.display = "none";
  document.getElementById("configFile").value = "";
  document.getElementById("configText").value = "";
  document.getElementById("searchText").value = "";
}

// Unified function to parse JSON and analyze mods
async function parseAndAnalyzeMods() {
  // First, try to get config data from either file upload or textarea
  let configDataToUse = configData;

  // If no config data from file upload, try to parse from textarea
  if (!configDataToUse) {
    const jsonText = document.getElementById("configText").value.trim();

    if (!jsonText) {
      showError("Please enter JSON content or upload a file");
      return;
    }

    try {
      configDataToUse = JSON.parse(jsonText);
      if (!configDataToUse.game || !configDataToUse.game.mods) {
        throw new Error("Invalid config format");
      }
      // Update global configData when using textarea input
      configData = configDataToUse;
    } catch (error) {
      showError("Invalid JSON format or missing game.mods array");
      return;
    }
  }

  // Now proceed with the analysis
  const button = document.getElementById("checkButton");
  const originalText = button.innerHTML;
  button.innerHTML = '<span class="loading"></span>Analyzing...';
  button.disabled = true;

  document.getElementById("progressSection").style.display = "block";
  document.getElementById("resultsSection").style.display = "none";

  try {
    // Determine the correct API URL based on environment
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const apiUrl = isLocalhost
      ? "/api/check-mods-simple"
      : `${window.location.origin}/api/check-mods-simple`;

    console.log("Using API URL:", apiUrl);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mods: configDataToUse.game.mods,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error Response:", errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let lines = buffer.split("\n");
      buffer = lines.pop();

      for (let line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.type === "progress") {
              updateProgress(data.current, data.total, data.modName);
            } else if (data.type === "complete") {
              checkResults = data;
              showResults(data);
            }
          } catch (e) {
            console.error("Error parsing JSON:", e, "Line:", line);
          }
        }
      }
    }
  } catch (error) {
    showError(`Error checking mods: ${error.message}`);
  } finally {
    button.innerHTML = originalText;
    button.disabled = false;
    document.getElementById("progressSection").style.display = "none";
  }
}

// File upload handling
document.getElementById("configFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        configData = JSON.parse(e.target.result);
        if (configData.game && configData.game.mods) {
          const modCount = configData.game.mods.length;
          document.getElementById("configSource").textContent = file.name;
          document.getElementById("modCount").textContent = modCount;
          document.getElementById("fileInfo").style.display = "block";
          showSuccess(`Successfully loaded ${file.name} with ${modCount} mods`);
        } else {
          throw new Error("Invalid config format");
        }
      } catch (error) {
        showError("Invalid JSON file or missing game.mods array");
        configData = null;
      }
    };
    reader.readAsText(file);
  }
});

// Check mods button - now unified
document
  .getElementById("checkButton")
  .addEventListener("click", parseAndAnalyzeMods);

// Search mods button
document.getElementById("searchButton").addEventListener("click", searchMods);

// Share button
document
  .getElementById("shareButton")
  .addEventListener("click", async function () {
    console.log("Share button clicked");
    console.log("checkResults:", checkResults);
    console.log("configData:", configData);

    if (!checkResults) {
      showError("No analysis results found. Please analyze mods first.");
      return;
    }

    if (!configData) {
      showError(
        "No configuration data found. Please upload a file or paste JSON content first."
      );
      return;
    }

    if (!configData.game || !configData.game.mods) {
      showError("Invalid configuration data. Please check your JSON format.");
      return;
    }

    const button = this;
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="loading"></span>Generating...';
    button.disabled = true;

    try {
      // Prepare data to encode (optimized for sharing)
      const shareData = {
        mods: configData.game.mods,
        results: checkResults.results || checkResults,
        summary: checkResults.summary,
        timestamp: Date.now(),
      };

      // Ultra-aggressive optimization for URL minification
      if (shareData.results && Array.isArray(shareData.results)) {
        shareData.results = shareData.results.map((mod) => {
          const optimized = {
            i: mod.modId,
            n: mod.name,
            v: mod.version,
            s: mod.status,
            z: Math.round(mod.size || 0), // Round size to save space
          };

          // Include dependencies with names (essential for display)
          if (mod.dependencies && mod.dependencies.length > 0) {
            optimized.d = mod.dependencies.map((dep) => ({
              i: dep.modId,
              n: dep.name,
            }));
          }

          // Include missing dependencies with names
          if (
            mod.dependencyCheck &&
            mod.dependencyCheck.missing &&
            mod.dependencyCheck.missing.length > 0
          ) {
            optimized.m = mod.dependencyCheck.missing.map((dep) => ({
              i: dep.modId,
              n: dep.name,
            }));
          }

          // Only include error if it exists and is not empty
          if (mod.error && mod.error.trim()) {
            optimized.e = mod.error.substring(0, 50); // Limit error message length
          }

          return optimized;
        });
      }

      // Ultra-optimize summary - only include non-zero values
      if (shareData.summary) {
        const summary = {};
        if (shareData.summary.upToDate > 0)
          summary.u = shareData.summary.upToDate;
        if (shareData.summary.outdated > 0)
          summary.o = shareData.summary.outdated;
        if (shareData.summary.missingDepsOnly > 0)
          summary.m = shareData.summary.missingDepsOnly;
        if (shareData.summary.errors > 0) summary.e = shareData.summary.errors;
        if (shareData.summary.processedCount > 0)
          summary.p = shareData.summary.processedCount;
        if (shareData.summary.originalTotal > 0)
          summary.t = shareData.summary.originalTotal;
        if (shareData.summary.isPartial) summary.i = true;

        shareData.summary = summary;
      }

      // Ultra-optimize mods array - only essential fields
      if (shareData.mods && Array.isArray(shareData.mods)) {
        shareData.mods = shareData.mods.map((mod) => ({
          i: mod.modId,
          n: mod.name,
          v: mod.version,
        }));
      }

      // Keep timestamp for validation
      // delete shareData.timestamp;

      // Compress and encode data
      const jsonString = JSON.stringify(shareData);
      const compressed = await compressData(jsonString);

      // Create shareable URL
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${compressed}`;

      // Check URL length and suggest tiny URL if too long
      if (shareUrl.length > 1500) {
        console.warn(`URL is very long: ${shareUrl.length} characters`);

        // Try to create a tiny URL using a free service
        try {
          const tinyUrlResponse = await fetch(
            "https://tinyurl.com/api-create.php",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: `url=${encodeURIComponent(shareUrl)}`,
            }
          );

          if (tinyUrlResponse.ok) {
            const tinyUrl = await tinyUrlResponse.text();
            if (tinyUrl && !tinyUrl.includes("error")) {
              await navigator.clipboard.writeText(tinyUrl);
              showSuccess(
                `Tiny URL copied to clipboard! (${tinyUrl.length} chars vs ${shareUrl.length} chars)`
              );
              return;
            }
          }
        } catch (error) {
          console.warn("Tiny URL creation failed:", error);
        }

        // Fallback to original URL
        showError(
          `Warning: Share URL is very long (${shareUrl.length} characters). Consider using a URL shortener.`
        );
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      showSuccess("Share link copied to clipboard!");
    } catch (error) {
      showError(`Error generating share link: ${error.message}`);
    } finally {
      button.innerHTML = originalText;
      button.disabled = false;
    }
  });

// Download report button
document
  .getElementById("downloadButton")
  .addEventListener("click", function () {
    if (checkResults) {
      const blob = new Blob([JSON.stringify(checkResults, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mod_check_report_${
        new Date().toISOString().split("T")[0]
      }.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });

function updateProgress(current, total, modName) {
  const percentage = (current / total) * 100;
  document.getElementById("progressFill").style.width = percentage + "%";
  document.getElementById(
    "progressText"
  ).textContent = `Checking ${current}/${total}: ${modName}`;
}

// Function to search for mods by name
async function searchMods() {
  const searchText = document.getElementById("searchText").value.trim();

  if (!searchText) {
    showError("Please enter mod names to search for");
    return;
  }

  // Parse search terms (split by newlines or commas)
  const searchTerms = searchText
    .split(/[\n,]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  if (searchTerms.length === 0) {
    showError("No valid search terms found");
    return;
  }

  // Reset state for new search
  pendingModSelections.clear();
  pendingSearchTerms = [];
  selectedMods = [];
  hasMultipleResults = false;

  const button = document.getElementById("searchButton");
  const originalText = button.innerHTML;
  button.innerHTML = '<span class="loading"></span>Searching...';
  button.disabled = true;

  document.getElementById("progressSection").style.display = "block";
  document.getElementById("resultsSection").style.display = "none";

  try {
    // Determine the correct API URL based on environment
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const apiUrl = isLocalhost
      ? "/api/search-mods"
      : `${window.location.origin}/api/search-mods`;

    console.log("Using search API URL:", apiUrl);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchTerms: searchTerms,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Search API Error Response:", errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);

            console.log("Received data type:", data.type, data);
            if (data.type === "progress") {
              updateSearchProgress(data.current, data.total, data.searchTerm);
            } else if (data.type === "multiple_results") {
              console.log(
                "Showing mod selection for:",
                data.searchTerm,
                "with",
                data.results.length,
                "results"
              );
              hasMultipleResults = true;
              pendingSearchTerms.push(data.searchTerm);
              pendingModSelections.set(data.searchTerm, data.results);
            } else if (data.type === "complete") {
              console.log(
                "Showing search results with",
                data.mods ? data.mods.length : 0,
                "mods"
              );
              // Add any single results to selectedMods
              if (data.mods && data.mods.length > 0) {
                selectedMods.push(...data.mods);
              }

              // If we have pending selections, show the first one
              if (pendingSearchTerms.length > 0) {
                showNextModSelection();
              } else {
                // All done, show final results
                showFinalSearchResults();
              }
            }
          } catch (error) {
            console.error("Error parsing search response:", error);
          }
        }
      }
    }
  } catch (error) {
    console.error("Search error:", error);
    showError(`Search failed: ${error.message}`);
  } finally {
    button.innerHTML = originalText;
    button.disabled = false;
  }
}

function updateSearchProgress(current, total, searchTerm) {
  const percentage = (current / total) * 100;
  document.getElementById("progressFill").style.width = percentage + "%";
  document.getElementById(
    "progressText"
  ).textContent = `Searching ${current}/${total}: "${searchTerm}"`;
}

function showNextModSelection() {
  if (pendingSearchTerms.length === 0) {
    showFinalSearchResults();
    return;
  }

  const nextSearchTerm = pendingSearchTerms[0];
  const results = pendingModSelections.get(nextSearchTerm);

  if (!results) {
    pendingSearchTerms.shift(); // Remove this term and try next
    showNextModSelection();
    return;
  }

  const data = {
    searchTerm: nextSearchTerm,
    results: results,
    totalFound: results.length,
  };

  showModSelection(data);
}

function showFinalSearchResults() {
  const data = {
    type: "complete",
    timestamp: new Date().toISOString(),
    mods: selectedMods,
  };

  showSearchResults(data);
}

function showModSelection(data) {
  // Hide progress and show selection interface
  document.getElementById("progressSection").style.display = "none";

  // Create selection interface
  const resultsSection = document.getElementById("resultsSection");
  resultsSection.style.display = "block";

  const summaryCards = document.getElementById("summaryCards");
  summaryCards.innerHTML = `
    <div class="summary-card missing-deps">
      <h3>${data.totalFound}</h3>
      <p>🔍 Multiple Results Found</p>
    </div>
    <div class="summary-card up-to-date">
      <h3>${data.searchTerm}</h3>
      <p>📋 Please Select One</p>
    </div>
  `;

  const modDetails = document.getElementById("modDetails");
  let detailsHtml = `<h3>🔍 Multiple results found for "${data.searchTerm}"</h3>`;
  detailsHtml += `<p>Please select the correct mod:</p>`;
  detailsHtml += `<div class="mod-selection-list">`;

  data.results.forEach((mod, index) => {
    const imageHtml = mod.imageUrl
      ? `<div class="mod-selection-image">
               <img src="${mod.imageUrl}" alt="${mod.name}" onerror="this.style.display='none'">
             </div>`
      : `<div class="mod-selection-image-placeholder">
               <span>📦</span>
             </div>`;

    detailsHtml += `
          <div class="mod-selection-item" onclick="selectModFromSearch('${mod.modId}', '${mod.name}', '${data.searchTerm}')">
            ${imageHtml}
            <div class="mod-selection-info">
              <h4>${mod.name}</h4>
              <p><strong>ID:</strong> ${mod.modId}</p>
              <p><strong>Version:</strong> Will be fetched when selected</p>
            </div>
            <div class="mod-selection-action">
              <button class="select-mod-btn">Select</button>
            </div>
          </div>
        `;
  });

  detailsHtml += `</div>`;
  modDetails.innerHTML = detailsHtml;

  // Store the selection data for later use
  pendingModSelections.set(data.searchTerm, data.results);
}

function showSearchResults(data) {
  document.getElementById("progressSection").style.display = "none";
  document.getElementById("resultsSection").style.display = "block";

  // Show summary cards for search results
  const summaryCards = document.getElementById("summaryCards");
  const modsCount = data.mods ? data.mods.length : 0;

  summaryCards.innerHTML = `
        <div class="summary-card up-to-date">
            <h3>${modsCount}</h3>
            <p>✅ Mods Found</p>
        </div>
        <div class="summary-card missing-deps">
            <h3>${
              data.timestamp ? new Date(data.timestamp).toLocaleString() : "Now"
            }</h3>
            <p>🕒 Generated</p>
        </div>
    `;

  // Show the generated JSON
  const modDetails = document.getElementById("modDetails");
  let detailsHtml = "<h3>📋 Generated JSON</h3>";

  if (data.mods && data.mods.length > 0) {
    // Filter out imageUrl and dependencies from the final JSON output
    // Keep only the basic mod info (modId, name, version)
    const cleanMods = data.mods.map((mod) => {
      const { imageUrl, dependencies, isDependency, ...cleanMod } = mod;
      return cleanMod;
    });

    // Remove duplicates based on modId
    const uniqueMods = cleanMods.filter(
      (mod, index, self) =>
        index === self.findIndex((m) => m.modId === mod.modId)
    );

    // Sort by name alphabetically
    const sortedMods = uniqueMods.sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    );

    const jsonOutput = {
      mods: sortedMods,
    };

    detailsHtml += `
      <div class="json-output">
        <pre><code>${JSON.stringify(jsonOutput, null, 4)}</code></pre>
        <button class="copy-json-btn" onclick="copyJsonToClipboard('${JSON.stringify(
          jsonOutput
        ).replace(/'/g, "\\'")}')">
          📋 Copy JSON
        </button>
      </div>
    `;
  } else {
    detailsHtml += `
      <div class="no-results">
        <p>No mods found for the search terms.</p>
      </div>
    `;
  }

  modDetails.innerHTML = detailsHtml;

  // Hide size analysis and dependency graph for search results
  document.getElementById("sizeAnalysis").style.display = "none";
  document.getElementById("fullscreenNetworkBtn").style.display = "none";
}

// Function to copy JSON to clipboard
function copyJsonToClipboard(jsonString) {
  navigator.clipboard
    .writeText(jsonString)
    .then(() => {
      showSuccess("JSON copied to clipboard!");
    })
    .catch((err) => {
      showError("Failed to copy JSON: " + err.message);
    });
}

async function selectModFromSearch(modId, modName, searchTerm) {
  // Get the selected mod from pending selections
  const availableMods = pendingModSelections.get(searchTerm);
  const selectedMod = availableMods.find((mod) => mod.modId === modId);

  if (!selectedMod) {
    showError("Selected mod not found");
    return;
  }

  // Show loading state
  const modDetails = document.getElementById("modDetails");
  modDetails.innerHTML = `
    <h3>📋 Getting Mod Version...</h3>
    <div class="loading-message">
      <div class="loading"></div>
      <p>Fetching version for ${selectedMod.name}...</p>
    </div>
  `;

  try {
    // Get the mod version from the API
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    const apiUrl = isLocalhost
      ? "/api/search-mods"
      : `${window.location.origin}/api/search-mods`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modId: modId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const versionData = await response.json();

    if (!versionData.success) {
      throw new Error("Failed to get mod version");
    }

    // Update the selected mod with the real version and dependencies
    selectedMod.version = versionData.version;
    selectedMod.dependencies = versionData.dependencies || [];

    // Add the selected mod to our collection
    selectedMods.push(selectedMod);

    // Process dependencies: get their versions and add them as separate mods
    if (selectedMod.dependencies && selectedMod.dependencies.length > 0) {
      showSuccess(
        `Processing ${selectedMod.dependencies.length} dependencies for ${selectedMod.name}...`
      );

      for (const dep of selectedMod.dependencies) {
        // Check if this dependency is already in our collection
        const existingMod = selectedMods.find((mod) => mod.modId === dep.modId);
        if (existingMod) {
          console.log(`Dependency ${dep.name} already exists in collection`);
          continue;
        }

        try {
          // Get version for this dependency
          const depResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              modId: dep.modId,
            }),
          });

          if (depResponse.ok) {
            const depVersionData = await depResponse.json();
            if (depVersionData.success) {
              // Add dependency as a separate mod
              const dependencyMod = {
                modId: dep.modId,
                name: dep.name,
                version: depVersionData.version,
                dependencies: depVersionData.dependencies || [],
                isDependency: true, // Flag to identify dependencies
              };
              selectedMods.push(dependencyMod);
              console.log(
                `Added dependency: ${dep.name} (${dep.modId}) - Version: ${depVersionData.version}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Failed to get version for dependency ${dep.name}:`,
            error
          );
          // Add dependency without version if we can't get it
          const dependencyMod = {
            modId: dep.modId,
            name: dep.name,
            version: "Unknown",
            dependencies: [],
            isDependency: true,
          };
          selectedMods.push(dependencyMod);
        }
      }
    }

    // Remove from pending selections and terms
    pendingModSelections.delete(searchTerm);
    pendingSearchTerms.shift(); // Remove the current search term

    // Show success message
    const depsCount = selectedMod.dependencies
      ? selectedMod.dependencies.length
      : 0;
    const totalModsCount = selectedMods.length;
    showSuccess(
      `Selected: ${selectedMod.name} (${selectedMod.modId}) - Version: ${selectedMod.version} - Dependencies: ${depsCount} - Total mods: ${totalModsCount}`
    );

    // Check if there are more mods to select
    if (pendingSearchTerms.length > 0) {
      // Show progress for remaining selections
      const remainingCount = pendingSearchTerms.length;
      const summaryCards = document.getElementById("summaryCards");
      summaryCards.innerHTML = `
        <div class="summary-card up-to-date">
          <h3>${selectedMods.length}</h3>
          <p>✅ Mods Selected</p>
        </div>
        <div class="summary-card missing-deps">
          <h3>${remainingCount}</h3>
          <p>⏳ Remaining</p>
        </div>
      `;

      modDetails.innerHTML = `
        <h3>📋 Mod Selected Successfully</h3>
        <div class="success-message">
          <p>✅ <strong>${selectedMod.name}</strong> has been added to your selection.</p>
          <p>📋 Next: Please select a mod for <strong>"${pendingSearchTerms[0]}"</strong></p>
        </div>
      `;

      // Show the next mod selection after a short delay
      setTimeout(() => {
        showNextModSelection();
      }, 1500);
    } else {
      // All selections complete, show final results
      hasMultipleResults = false;
      showFinalSearchResults();
    }
  } catch (error) {
    console.error("Error getting mod version:", error);
    showError(`Failed to get version: ${error.message}`);

    // Still show the mod but with unknown version
    selectedMod.version = "Unknown";

    const jsonOutput = { mods: [selectedMod] };

    modDetails.innerHTML = `
      <h3>📋 Selected Mod JSON (Version Unknown)</h3>
      <div class="json-output">
        <pre><code>${JSON.stringify(jsonOutput, null, 4)}</code></pre>
        <button class="copy-json-btn" onclick="copyJsonToClipboard('${JSON.stringify(
          jsonOutput
        ).replace(/'/g, "\\'")}')">
          📋 Copy JSON
        </button>
      </div>
    `;
  }
}

// Function to select a mod from search results
function selectMod(modId, modName) {
  // Create a config-like structure for the selected mod
  const selectedMod = {
    modId: modId,
    name: modName,
    version: "Unknown", // We don't have version info from search
  };

  // Switch to paste tab and populate with the selected mod
  switchTab("paste");

  const configText = document.getElementById("configText");
  const config = {
    game: {
      mods: [selectedMod],
    },
  };

  configText.value = JSON.stringify(config, null, 2);
  showSuccess(`Selected mod: ${modName} (${modId})`);
}

// Helper function to safely get dependencies
function getSafeDependencies(mod) {
  if (mod.dependencies && Array.isArray(mod.dependencies)) {
    return mod.dependencies.filter((dep) => dep && dep.modId);
  }
  return [];
}

function showResults(data) {
  // Update global variables
  checkResults = data;

  document.getElementById("progressSection").style.display = "none";
  document.getElementById("resultsSection").style.display = "block";

  const summary = data.summary;
  // Handle both data.results and direct results array
  const results = data.results || data;

  // Show partial results warning if applicable
  if (summary.isPartial) {
    showError(
      `Partial results: Processed ${summary.processedCount} out of ${summary.originalTotal} mods. ${summary.remainingCount} mods remaining.`
    );
  }

  // Show summary cards
  const summaryCards = document.getElementById("summaryCards");
  summaryCards.innerHTML = `
        <div class="summary-card up-to-date">
            <h3>${summary.upToDate}</h3>
            <p>✅ Up to Date</p>
        </div>
        <div class="summary-card outdated">
            <h3>${summary.outdated + (summary.outdatedMissingDeps || 0)}</h3>
            <p>⚠️ Outdated</p>
        </div>
        <div class="summary-card missing-deps">
            <h3>${
              summary.missingDepsOnly + (summary.outdatedMissingDeps || 0)
            }</h3>
            <p>📦 Missing Deps</p>
        </div>
        <div class="summary-card errors">
            <h3>${summary.errors}</h3>
            <p>❌ Errors</p>
        </div>
    `;

  showSizeAnalysis(results);
  showDetailedResults(results);

  document
    .getElementById("resultsSection")
    .scrollIntoView({ behavior: "smooth" });
}

function showSizeAnalysis(results) {
  const modsWithSize = results.filter((r) => r.size > 0);
  const totalSize = modsWithSize.reduce((sum, mod) => sum + mod.size, 0);
  const largestMod = modsWithSize.reduce(
    (max, mod) => (mod.size > max.size ? mod : max),
    { size: 0 }
  );

  const allDependencies = new Set();
  results.forEach((mod) => {
    const deps = getSafeDependencies(mod);
    deps.forEach((dep) => {
      allDependencies.add(dep.modId);
    });
  });

  const sizeStats = document.getElementById("sizeStats");
  sizeStats.innerHTML = `
        <div style="background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 8px; text-align: center;">
            <h4 style="margin: 0 0 10px 0; color: #4CAF50;">📦 Total Size</h4>
            <p style="font-size: 1.8rem; font-weight: bold; margin: 0;">${totalSize.toFixed(
              1
            )} MB</p>
            <p style="font-size: 0.9rem; opacity: 0.8; margin: 5px 0 0 0;">${
              modsWithSize.length
            } mods</p>
        </div>
        <div style="background: rgba(255, 152, 0, 0.1); padding: 15px; border-radius: 8px; text-align: center;">
            <h4 style="margin: 0 0 10px 0; color: #ff9800;">🏆 Largest Mod</h4>
            <p style="font-size: 1.2rem; font-weight: bold; margin: 0;">${
              largestMod.name || "Unknown"
            }</p>
            <p style="font-size: 1.5rem; font-weight: bold; margin: 5px 0 0 0; color: #ff9800;">${
              largestMod.size ? largestMod.size.toFixed(1) + " MB" : "Unknown"
            }</p>
        </div>
        <div style="background: rgba(156, 39, 176, 0.1); padding: 15px; border-radius: 8px; text-align: center;">
            <h4 style="margin: 0 0 10px 0; color: #9c27b0;">🔗 Dependencies</h4>
            <p style="font-size: 1.8rem; font-weight: bold; margin: 0;">${
              allDependencies.size
            }</p>
            <p style="font-size: 0.9rem; opacity: 0.8; margin: 5px 0 0 0;">unique deps</p>
        </div>
    `;
}

function showDependencyNetwork(results) {
  const container = document.getElementById("networkGraph");
  container.innerHTML = "";

  // Show fullscreen button
  const fullscreenBtn = document.getElementById("fullscreenNetworkBtn");
  fullscreenBtn.style.display = "block";
  fullscreenBtn.onclick = () => showFullscreenNetwork(results);

  const width = container.offsetWidth || 800;
  const height = 400;

  const links = [];

  // Determine node types based on dependency levels
  const nodeTypes = {};
  const dependencyLevels = {};

  // First pass: identify all dependency modIds
  const allDependencyModIds = new Set();
  results.forEach((mod) => {
    if (mod.dependencies) {
      mod.dependencies.forEach((dep) => {
        allDependencyModIds.add(dep.modId);
      });
    }
  });

  // Second pass: calculate dependency levels
  function calculateDependencyLevel(modId) {
    // Count how many other mods depend on this mod
    let dependencyCount = 0;
    results.forEach((mod) => {
      if (
        mod.dependencies &&
        mod.dependencies.some((dep) => dep.modId === modId)
      ) {
        dependencyCount++;
      }
    });
    return dependencyCount;
  }

  // Calculate levels for all mods
  results.forEach((mod) => {
    dependencyLevels[mod.modId] = calculateDependencyLevel(mod.modId);
  });

  // Determine node types based on levels (simplified)
  results.forEach((mod) => {
    if (mod.dependencyCheck && mod.dependencyCheck.hasMissing) {
      nodeTypes[mod.modId] = "missing";
    } else if (dependencyLevels[mod.modId] === 0) {
      nodeTypes[mod.modId] = "no-dependencies"; // Green - no one depends on this mod
    } else {
      nodeTypes[mod.modId] = "dependency"; // Blue - is a dependency
    }

    // Debug log
    console.log(
      `${mod.name}: level=${dependencyLevels[mod.modId]}, type=${
        nodeTypes[mod.modId]
      }, hasDeps=${mod.dependencies && mod.dependencies.length > 0}`
    );
  });

  // Create nodes
  const nodes = results.map((mod) => ({
    id: mod.modId,
    name: mod.name,
    size: mod.size || 1000,
    type: nodeTypes[mod.modId] || "unknown",
    level: dependencyLevels[mod.modId] || 0,
  }));

  // Create node map for easy lookup
  const nodeMap = new Map();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  // Add dependencies and links (only direct dependencies, no transitive)
  results.forEach((mod) => {
    if (mod.dependencies) {
      mod.dependencies.forEach((dep) => {
        // Find the dependency mod
        const depMod = results.find((m) => m.modId === dep.modId);
        if (depMod) {
          // Only add direct dependency links
          links.push({
            source: mod.modId,
            target: dep.modId,
            type: "dependency",
          });
        }
      });
    }

    // Add missing dependencies
    if (mod.dependencyCheck && mod.dependencyCheck.missing) {
      mod.dependencyCheck.missing.forEach((dep) => {
        // Find the missing dependency mod
        const depMod = results.find((m) => m.modId === dep.modId);
        if (depMod) {
          links.push({
            source: mod.modId,
            target: dep.modId,
            type: "missing",
          });
        }
      });
    }
  });

  // Remove redundant transitive links
  const redundantLinks = [];

  // For each link A -> B, check if there's a path A -> C -> B
  links.forEach((link) => {
    if (link.type === "dependency") {
      const sourceId = link.source;
      const targetId = link.target;

      // Find all mods that the source depends on (excluding the target)
      const sourceMod = results.find((m) => m.modId === sourceId);
      if (sourceMod && sourceMod.dependencies) {
        const intermediateDeps = sourceMod.dependencies
          .map((dep) => dep.modId)
          .filter((depId) => depId !== targetId);

        // Check if any of these intermediate deps can reach the target
        for (const intermediateId of intermediateDeps) {
          if (canReach(intermediateId, targetId, results)) {
            redundantLinks.push(link);
            break;
          }
        }
      }
    }
  });

  // Remove redundant links
  redundantLinks.forEach((redundantLink) => {
    const index = links.findIndex(
      (link) =>
        link.source === redundantLink.source &&
        link.target === redundantLink.target
    );
    if (index !== -1) {
      links.splice(index, 1);
    }
  });

  // Helper function to check if mod A can reach mod B through dependencies
  function canReach(fromId, toId, mods, visited = new Set()) {
    if (visited.has(fromId)) return false; // Avoid cycles
    visited.add(fromId);

    if (fromId === toId) return true;

    const fromMod = mods.find((m) => m.modId === fromId);
    if (!fromMod || !fromMod.dependencies) return false;

    return fromMod.dependencies.some((dep) =>
      canReach(dep.modId, toId, mods, new Set(visited))
    );
  }

  // Initialize random positions for all nodes
  nodes.forEach((node) => {
    node.x = Math.random() * width;
    node.y = Math.random() * height;
  });

  // Create SVG
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Define arrow markers
  svg
    .append("defs")
    .selectAll("marker")
    .data(["dependency", "missing"])
    .enter()
    .append("marker")
    .attr("id", (d) => `arrow-${d}`)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 12)
    .attr("markerHeight", 12)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", (d) => (d === "missing" ? "#f44336" : "#2196F3"))
    .attr("stroke", (d) => (d === "missing" ? "#d32f2f" : "#1976d2"))
    .attr("stroke-width", 1);

  // Create simulation
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(120)
        .strength(0.2)
    )
    .force("charge", d3.forceManyBody().strength(-1500).distanceMax(200))
    .force(
      "collision",
      d3
        .forceCollide()
        .radius((d) => Math.sqrt(d.size) * 2 + 15)
        .strength(1.0)
    )
    .force("linkCollision", createLinkCollisionForce(links, 30));

  // Create links
  const link = svg
    .append("g")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", (d) => (d.type === "missing" ? "#f44336" : "#2196F3"))
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-dasharray", (d) => (d.type === "missing" ? "5,5" : "none"))
    .attr("marker-end", (d) => `url(#arrow-${d.type})`);

  // Create simple nodes
  const node = svg
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", (d) => Math.sqrt(d.size) * 2 + 8)
    .attr("fill", (d) => {
      switch (d.type) {
        case "no-dependencies":
          return "#4CAF50"; // Green for mods without dependencies
        case "dependency":
          return "#2196F3"; // Blue for dependencies
        case "missing":
          return "#f44336"; // Red for missing dependencies
        default:
          return "#666";
      }
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "grab")
    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .on("click", function (event, d) {
      showModDetails(d, results);
    });

  // Add labels
  const labels = svg
    .append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text((d) =>
      d.name.length > 12 ? d.name.substring(0, 10) + "..." : d.name
    )
    .attr("font-size", "10px")
    .attr("fill", "white")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("pointer-events", "none")
    .style("font-weight", "bold")
    .style("text-shadow", "1px 1px 2px rgba(0,0,0,0.8)");

  // Add tooltips
  node
    .append("title")
    .text(
      (d) =>
        `${d.name}\nType: ${d.type}\nSize: ${
          d.size ? d.size.toFixed(1) + " MB" : "Unknown"
        }\nDependencies: ${d.dependencies}`
    );

  // Add legend
  const legend = svg.append("g").attr("class", "legend");

  const legendData = [
    { type: "no-dependencies", label: "Main mods", color: "#4CAF50" },
    { type: "dependency", label: "Dependencies", color: "#2196F3" },
    { type: "missing", label: "Missing Dependencies", color: "#f44336" },
  ];

  const legendItems = legend
    .selectAll(".legend-item")
    .data(legendData)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(10, ${10 + i * 25})`);

  legendItems
    .append("circle")
    .attr("r", 6)
    .attr("fill", (d) => d.color)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);

  legendItems
    .append("text")
    .attr("x", 15)
    .attr("y", 4)
    .attr("font-size", "12px")
    .attr("fill", "#333")
    .style("font-weight", "bold")
    .text((d) => d.label);

  // Update positions
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

    labels.attr("x", (d) => d.x).attr("y", (d) => d.y);
  });

  // Drag functions
  function dragstarted(event, d) {
    // Reactivate simulation for smooth movement and link updates
    if (!event.active) simulation.alphaTarget(0.3).restart();
    // Fix the dragged node position to prevent it from being pulled by forces
    d.fx = d.x;
    d.fy = d.y;
    d3.select(this).style("cursor", "grabbing");
  }

  function dragged(event, d) {
    // Update fixed position to follow mouse
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    // Deactivate simulation and release the node
    if (!event.active) simulation.alphaTarget(0);
    // Release the node so it can move freely again
    d.fx = null;
    d.fy = null;
    d3.select(this).style("cursor", "grab");
  }
}

function showDetailedResults(results) {
  const modDetails = document.getElementById("modDetails");
  const outdatedMods = results.filter(
    (r) => r.status === "outdated" || r.status === "outdated-missing-deps"
  );
  const missingDepsMods = results.filter(
    (r) => r.status === "missing-deps" || r.status === "outdated-missing-deps"
  );
  const errorMods = results.filter((r) => r.status === "error");

  let detailsHTML = "";

  if (outdatedMods.length > 0) {
    detailsHTML += `
            <div class="mod-list">
                <h3>⚠️ Outdated Mods (${outdatedMods.length})</h3>
                ${outdatedMods
                  .map(
                    (mod) => `
                    <div class="mod-item outdated">
                        <div class="mod-name">${mod.name}</div>
                        <div class="mod-status">${mod.version} → ${
                      mod.currentVersion
                    } (${
                      mod.size ? mod.size.toFixed(1) + " MB" : "Unknown size"
                    })</div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
  }

  if (missingDepsMods.length > 0) {
    detailsHTML += `
            <div class="mod-list">
                <h3>📦 Mods with Missing Dependencies (${
                  missingDepsMods.length
                })</h3>
                ${missingDepsMods
                  .map(
                    (mod) => `
                    <div class="mod-item missing-deps">
                        <div class="mod-name">${mod.name}</div>
                        <div class="mod-status">Missing: ${mod.dependencyCheck.missing
                          .map((d) => d.name)
                          .join(", ")}</div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
  }

  if (errorMods.length > 0) {
    detailsHTML += `
            <div class="mod-list">
                <h3>❌ Errors (${errorMods.length})</h3>
                ${errorMods
                  .map(
                    (mod) => `
                    <div class="mod-item error">
                        <div class="mod-name">${mod.name}</div>
                        <div class="mod-status">${mod.message}</div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
  }

  if (
    outdatedMods.length === 0 &&
    missingDepsMods.length === 0 &&
    errorMods.length === 0
  ) {
    const upToDateMods = results.filter((r) => r.status === "up-to-date");
    detailsHTML += `
            <div class="mod-list">
                <h3>✅ All Mods Up to Date (${upToDateMods.length})</h3>
                ${upToDateMods
                  .slice(0, 10)
                  .map(
                    (mod) => `
                    <div class="mod-item up-to-date">
                        <div class="mod-name">${mod.name}</div>
                        <div class="mod-status">v${mod.currentVersion} (${
                      mod.size ? mod.size.toFixed(1) + " MB" : "Unknown size"
                    })</div>
                    </div>
                `
                  )
                  .join("")}
                ${
                  upToDateMods.length > 10
                    ? `<p style="text-align: center; margin-top: 10px;">... and ${
                        upToDateMods.length - 10
                      } more</p>`
                    : ""
                }
            </div>
        `;
  }

  modDetails.innerHTML = detailsHTML;

  // Show and configure the fullscreen network button
  const fullscreenBtn = document.getElementById("fullscreenNetworkBtn");
  fullscreenBtn.style.display = "block";
  fullscreenBtn.onclick = () => showFullscreenNetwork(results);
}

function showModDetails(nodeData, allResults) {
  const modData = allResults.find((mod) => mod.modId === nodeData.id);

  // Calculate total size including all dependencies (direct and indirect)
  function calculateTotalSizeWithDependencies(modId, visited = new Set()) {
    if (visited.has(modId)) return 0; // Avoid cycles
    visited.add(modId);

    const mod = allResults.find((m) => m.modId === modId);
    if (!mod) return 0;

    let totalSize = mod.size || 0;

    // Add sizes of all dependencies
    if (mod.dependencies) {
      mod.dependencies.forEach((dep) => {
        totalSize += calculateTotalSizeWithDependencies(
          dep.modId,
          new Set(visited)
        );
      });
    }

    return totalSize;
  }

  const totalSizeWithDeps = calculateTotalSizeWithDependencies(nodeData.id);

  let detailHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    background: rgba(0,0,0,0.9); padding: 20px; border-radius: 10px; 
                    max-width: 500px; z-index: 1000; color: white; max-height: 80vh; overflow-y: auto;">
            <h3 style="margin-top: 0;">${nodeData.name}</h3>
            <p><strong>Type:</strong> ${nodeData.type}</p>
            <p><strong>Size:</strong> ${
              nodeData.size ? nodeData.size.toFixed(1) + " MB" : "Unknown"
            }</p>
            <p><strong>Size w/ deps:</strong> ${
              totalSizeWithDeps
                ? totalSizeWithDeps.toFixed(1) + " MB"
                : "Unknown"
            }</p>
    `;

  if (modData) {
    detailHTML += `
            <p><strong>Dependencies:</strong> ${modData.dependencies.length}</p>
        `;

    if (modData.dependencies.length > 0) {
      detailHTML += `
                <div style="margin-top: 10px;">
                    <strong>Dependencies:</strong>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        ${modData.dependencies
                          .map((dep) => `<li>${dep.name}</li>`)
                          .join("")}
                    </ul>
                </div>
            `;
    }

    if (
      modData.dependencyCheck &&
      modData.dependencyCheck.missing &&
      modData.dependencyCheck.missing.length > 0
    ) {
      detailHTML += `
                <div style="margin-top: 10px; color: #f44336;">
                    <strong>Missing Dependencies:</strong>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        ${modData.dependencyCheck.missing
                          .map((dep) => `<li>${dep.name}</li>`)
                          .join("")}
                    </ul>
                </div>
            `;
    }
  }

  detailHTML += `
            <button onclick="this.parentElement.remove()" 
                    style="background: #f44336; color: white; border: none; 
                           padding: 8px 16px; border-radius: 4px; cursor: pointer; 
                           margin-top: 15px;">
                Close
            </button>
        </div>
    `;

  // Remove existing popup
  const existing = document.querySelector('[style*="position: fixed"]');
  if (existing) existing.remove();

  // Add new popup
  const popup = document.createElement("div");
  popup.innerHTML = detailHTML;
  document.body.appendChild(popup);
}

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;

  document.querySelector(".container").appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

function showSuccess(message) {
  const successDiv = document.createElement("div");
  successDiv.className = "error-message";
  successDiv.style.background = "rgba(76, 175, 80, 0.2)";
  successDiv.style.borderColor = "#4CAF50";
  successDiv.style.color = "#c8e6c9";
  successDiv.innerHTML = `<strong>Success:</strong> ${message}`;

  document.querySelector(".container").appendChild(successDiv);

  setTimeout(() => {
    successDiv.remove();
  }, 3000);
}

// Compression function using LZ-string
async function compressData(data) {
  try {
    // Use LZ-string for compression with more aggressive settings
    const compressed = LZString.compressToEncodedURIComponent(data);

    // Log compression stats
    const originalSize = data.length;
    const compressedSize = compressed.length;
    const compressionRatio = (
      (1 - compressedSize / originalSize) *
      100
    ).toFixed(1);
    console.log(
      `Compression: ${originalSize} -> ${compressedSize} chars (${compressionRatio}% reduction)`
    );

    return compressed;
  } catch (error) {
    console.warn("Compression failed, using original data:", error);
    return data;
  }
}

// Decompression function
async function decompressData(compressedData) {
  try {
    // Use LZ-string for decompression
    return LZString.decompressFromEncodedURIComponent(compressedData);
  } catch (error) {
    console.warn("Decompression failed, using original data:", error);
    return compressedData;
  }
}

// Function to decompress minified data back to original format
function decompressMinifiedData(minifiedData) {
  const decompressed = {};

  // Decompress mods
  if (minifiedData.mods && Array.isArray(minifiedData.mods)) {
    decompressed.mods = minifiedData.mods.map((mod) => ({
      modId: mod.i,
      name: mod.n,
      version: mod.v,
    }));
  }

  // Decompress results
  if (minifiedData.results && Array.isArray(minifiedData.results)) {
    decompressed.results = minifiedData.results.map((mod) => {
      const decompressedMod = {
        modId: mod.i,
        name: mod.n,
        version: mod.v,
        status: mod.s,
        size: mod.z,
        dependencies: [],
      };

      // Decompress dependencies with names
      if (mod.d && Array.isArray(mod.d)) {
        decompressedMod.dependencies = mod.d.map((dep) => ({
          modId: dep.i,
          name: dep.n || "Unknown",
        }));
      }

      // Decompress missing dependencies with names
      if (mod.m && Array.isArray(mod.m)) {
        decompressedMod.dependencyCheck = {
          missing: mod.m.map((dep) => ({
            modId: dep.i,
            name: dep.n || "Unknown",
          })),
        };
      }

      // Decompress error
      if (mod.e) {
        decompressedMod.error = mod.e;
      }

      return decompressedMod;
    });
  }

  // Decompress summary with defaults
  if (minifiedData.summary) {
    decompressed.summary = {
      upToDate: minifiedData.summary.u || 0,
      outdated: minifiedData.summary.o || 0,
      missingDepsOnly: minifiedData.summary.m || 0,
      errors: minifiedData.summary.e || 0,
      processedCount: minifiedData.summary.p || 0,
      originalTotal: minifiedData.summary.t || 0,
      isPartial: minifiedData.summary.i || false,
    };
  }

  // Add timestamp if not present
  if (!minifiedData.timestamp) {
    decompressed.timestamp = Date.now();
  } else {
    decompressed.timestamp = minifiedData.timestamp;
  }

  return decompressed;
}

// Function to load shared data from URL
async function loadSharedData() {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get("share");

  if (!encodedData) return;

  try {
    // Show loading state
    document.getElementById("progressSection").style.display = "block";
    document.getElementById("progressSection").querySelector("h3").textContent =
      "⏳ Loading shared data...";

    // Decode and decompress data
    const jsonString = await decompressData(encodedData);
    const shareData = JSON.parse(jsonString);

    // Check if data is not too old (optional - you can remove this check)
    const now = Date.now();
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    if (shareData.timestamp && now - shareData.timestamp > oneWeekInMs) {
      showError("This share link is older than 7 days and may be outdated.");
    }

    // Decompress minified data back to original format
    const decompressedData = decompressMinifiedData(shareData);

    // Set the data
    configData = { game: { mods: decompressedData.mods } };
    checkResults = decompressedData;

    // Show the results
    try {
      showResults(decompressedData);

      // Show success message
      showSuccess("Shared mod analysis loaded successfully!");

      // Update file info
      document.getElementById("configSource").textContent = "Shared Link";
      document.getElementById("modCount").textContent = shareData.mods.length;
      document.getElementById("fileInfo").style.display = "block";
    } catch (error) {
      console.error("Error showing results:", error);
      showError("Error displaying shared data. The data may be corrupted.");
    }

    // Add visual indicator for shared content
    const container = document.querySelector(".container");
    const sharedIndicator = document.createElement("div");
    sharedIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #9C27B0;
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      `;
    sharedIndicator.textContent = "🔗 Shared Content";
    document.body.appendChild(sharedIndicator);

    // Remove indicator after 5 seconds
    setTimeout(() => {
      if (sharedIndicator.parentElement) {
        sharedIndicator.remove();
      }
    }, 5000);
  } catch (error) {
    showError(`Error loading shared data: ${error.message}`);
  } finally {
    document.getElementById("progressSection").style.display = "none";
  }
}

// Load shared data when page loads
document.addEventListener("DOMContentLoaded", function () {
  loadSharedData();

  // Ensure the Analyze Mods button is visible by default (upload tab is active)
  const checkButton = document.getElementById("checkButton");
  checkButton.style.display = "inline-block";
});

// Function to create a force that prevents link crossings
function createLinkCollisionForce(links, strength = 30) {
  return function () {
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        const link1 = links[i];
        const link2 = links[j];

        // Skip if links share a node
        if (
          link1.source === link2.source ||
          link1.source === link2.target ||
          link1.target === link2.source ||
          link1.target === link2.target
        ) {
          continue;
        }

        // Check if links intersect
        const intersection = getLineIntersection(
          link1.source.x,
          link1.source.y,
          link1.target.x,
          link1.target.y,
          link2.source.x,
          link2.source.y,
          link2.target.x,
          link2.target.y
        );

        if (intersection) {
          // Apply repulsion force to separate the links
          const dx = link1.source.x - link2.source.x;
          const dy = link1.source.y - link2.source.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 0) {
            const force = strength / (distance * distance);
            const fx = (dx / distance) * force;
            const fy = (dy / distance) * force;

            link1.source.vx += fx;
            link1.source.vy += fy;
            link2.source.vx -= fx;
            link2.source.vy -= fy;
          }
        }
      }
    }
  };
}

// Function to check if two line segments intersect
function getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // Lines are parallel

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection point is on both line segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  return null;
}

// Fullscreen Network Functions
function showFullscreenNetwork(results) {
  const modal = document.getElementById("fullscreenNetworkModal");
  const container = document.getElementById("fullscreenNetworkGraph");

  modal.style.display = "flex";
  container.innerHTML = "";

  // Get container dimensions
  const width = container.offsetWidth;
  const height = container.offsetHeight;

  const links = [];

  // Determine node types based on dependency levels
  const nodeTypes = {};
  const dependencyLevels = {};

  // First pass: identify all dependency modIds
  const allDependencyModIds = new Set();
  results.forEach((mod) => {
    if (mod.dependencies) {
      mod.dependencies.forEach((dep) => {
        allDependencyModIds.add(dep.modId);
      });
    }
  });

  // Second pass: calculate dependency levels
  function calculateDependencyLevel(modId) {
    // Count how many other mods depend on this mod
    let dependencyCount = 0;
    results.forEach((mod) => {
      if (
        mod.dependencies &&
        mod.dependencies.some((dep) => dep.modId === modId)
      ) {
        dependencyCount++;
      }
    });
    return dependencyCount;
  }

  // Calculate levels for all mods
  results.forEach((mod) => {
    dependencyLevels[mod.modId] = calculateDependencyLevel(mod.modId);
  });

  // Determine node types based on levels (simplified)
  results.forEach((mod) => {
    if (mod.dependencyCheck && mod.dependencyCheck.hasMissing) {
      nodeTypes[mod.modId] = "missing";
    } else if (dependencyLevels[mod.modId] === 0) {
      nodeTypes[mod.modId] = "no-dependencies"; // Green - no one depends on this mod
    } else {
      nodeTypes[mod.modId] = "dependency"; // Blue - is a dependency
    }
  });

  // Create nodes
  const nodes = results.map((mod) => ({
    id: mod.modId,
    name: mod.name,
    size: mod.size || 1000,
    type: nodeTypes[mod.modId] || "unknown",
    level: dependencyLevels[mod.modId] || 0,
  }));

  // Create node map for easy lookup
  const nodeMap = new Map();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  // Add dependencies and links (only direct dependencies, no transitive)
  results.forEach((mod) => {
    if (mod.dependencies) {
      mod.dependencies.forEach((dep) => {
        // Find the dependency mod
        const depMod = results.find((m) => m.modId === dep.modId);
        if (depMod) {
          // Only add direct dependency links
          links.push({
            source: mod.modId,
            target: dep.modId,
            type: "dependency",
          });
        }
      });
    }

    // Add missing dependencies
    if (mod.dependencyCheck && mod.dependencyCheck.missing) {
      mod.dependencyCheck.missing.forEach((dep) => {
        // Find the missing dependency mod
        const depMod = results.find((m) => m.modId === dep.modId);
        if (depMod) {
          links.push({
            source: mod.modId,
            target: dep.modId,
            type: "missing",
          });
        }
      });
    }
  });

  // Remove redundant transitive links
  const redundantLinks = [];

  // For each link A -> B, check if there's a path A -> C -> B
  links.forEach((link) => {
    if (link.type === "dependency") {
      const sourceId = link.source;
      const targetId = link.target;

      // Find all mods that the source depends on (excluding the target)
      const sourceMod = results.find((m) => m.modId === sourceId);
      if (sourceMod && sourceMod.dependencies) {
        const intermediateDeps = sourceMod.dependencies
          .map((dep) => dep.modId)
          .filter((depId) => depId !== targetId);

        // Check if any of these intermediate deps can reach the target
        for (const intermediateId of intermediateDeps) {
          if (canReach(intermediateId, targetId, results)) {
            redundantLinks.push(link);
            break;
          }
        }
      }
    }
  });

  // Remove redundant links
  redundantLinks.forEach((redundantLink) => {
    const index = links.findIndex(
      (link) =>
        link.source === redundantLink.source &&
        link.target === redundantLink.target
    );
    if (index !== -1) {
      links.splice(index, 1);
    }
  });

  // Helper function to check if mod A can reach mod B through dependencies
  function canReach(fromId, toId, mods, visited = new Set()) {
    if (visited.has(fromId)) return false; // Avoid cycles
    visited.add(fromId);

    if (fromId === toId) return true;

    const fromMod = mods.find((m) => m.modId === fromId);
    if (!fromMod || !fromMod.dependencies) return false;

    return fromMod.dependencies.some((dep) =>
      canReach(dep.modId, toId, mods, new Set(visited))
    );
  }

  // Initialize random positions for all nodes
  nodes.forEach((node) => {
    node.x = Math.random() * width;
    node.y = Math.random() * height;
  });

  // Create SVG with zoom support
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Define arrow markers
  svg
    .append("defs")
    .selectAll("marker")
    .data(["dependency", "missing"])
    .enter()
    .append("marker")
    .attr("id", (d) => `arrow-${d}`)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 12)
    .attr("markerHeight", 12)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", (d) => (d === "missing" ? "#f44336" : "#2196F3"))
    .attr("stroke", (d) => (d === "missing" ? "#d32f2f" : "#1976d2"))
    .attr("stroke-width", 1);

  // Create zoom behavior
  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Create main group for zoom
  const g = svg.append("g");

  // Selection state
  const selectedNodes = new Set();
  let selectionInfo = null;

  // Create selection info display
  const selectionInfoDiv = document.createElement("div");
  selectionInfoDiv.id = "selectionInfo";
  selectionInfoDiv.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 5px;
    font-size: 14px;
    display: none;
    z-index: 1000;
  `;
  container.appendChild(selectionInfoDiv);

  // Function to update selection display
  function updateSelectionDisplay() {
    if (selectedNodes.size === 0) {
      selectionInfoDiv.style.display = "none";
      return;
    }

    const totalSize = Array.from(selectedNodes).reduce((sum, nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return sum + (node ? node.size : 0);
    }, 0);

    const nodeNames = Array.from(selectedNodes).map((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return node ? node.name : nodeId;
    });

    selectionInfoDiv.innerHTML = `
      <div><strong>Selected: ${selectedNodes.size} mods</strong></div>
      <div>Total size: ${totalSize.toFixed(1)} MB</div>
      <div style="font-size: 12px; margin-top: 5px;">
        ${nodeNames.slice(0, 3).join(", ")}${
      nodeNames.length > 3 ? ` +${nodeNames.length - 3} more` : ""
    }
      </div>
    `;
    selectionInfoDiv.style.display = "block";
  }

  // Create simulation
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(180)
        .strength(0.2)
    )
    .force("charge", d3.forceManyBody().strength(-2500).distanceMax(300))
    .force(
      "collision",
      d3
        .forceCollide()
        .radius((d) => Math.sqrt(d.size) * 3 + 20)
        .strength(1.0)
    )
    .force("linkCollision", createLinkCollisionForce(links, 50));

  // Create links
  const link = g
    .append("g")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", (d) => (d.type === "missing" ? "#f44336" : "#2196F3"))
    .attr("stroke-width", 3)
    .attr("stroke-opacity", 0.7)
    .attr("stroke-dasharray", (d) => (d.type === "missing" ? "8,8" : "none"))
    .attr("marker-end", (d) => `url(#arrow-${d.type})`);

  // Create simple nodes
  const node = g
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", (d) => Math.sqrt(d.size) * 3 + 12)
    .attr("fill", (d) => {
      switch (d.type) {
        case "no-dependencies":
          return "#4CAF50"; // Green
        case "dependency":
          return "#2196F3"; // Blue
        case "missing":
          return "#f44336"; // Red
        default:
          return "#666";
      }
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "grab")
    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .on("click", function (event, d) {
      // Check if Ctrl/Cmd key is pressed for multi-selection
      if (event.ctrlKey || event.metaKey) {
        event.stopPropagation();

        if (selectedNodes.has(d.id)) {
          selectedNodes.delete(d.id);
        } else {
          selectedNodes.add(d.id);
        }

        // Update node appearance
        d3.select(this)
          .attr("stroke", selectedNodes.has(d.id) ? "#FFD700" : "#fff")
          .attr("stroke-width", selectedNodes.has(d.id) ? 4 : 2);

        updateSelectionDisplay();
      } else {
        // Single click - show mod details
        showModDetails(d, results);
      }
    });

  // Add labels
  const labels = g
    .append("g")
    .selectAll("text")
    .data(nodes)
    .enter()
    .append("text")
    .text((d) =>
      d.name.length > 15 ? d.name.substring(0, 15) + "..." : d.name
    )
    .attr("font-size", "12px")
    .attr("fill", "white")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("pointer-events", "none")
    .style("font-weight", "bold")
    .style("text-shadow", "2px 2px 4px rgba(0,0,0,0.8)");

  // Add tooltips
  node
    .append("title")
    .text(
      (d) =>
        `${d.name}\nType: ${d.type}\nSize: ${
          d.size ? d.size.toFixed(1) + " MB" : "Unknown"
        }\nDependencies: ${d.dependencies}`
    );

  // Add legend (fixed position, not affected by zoom)
  const legend = svg.append("g").attr("class", "legend");

  const legendData = [
    { type: "no-dependencies", label: "Main mods", color: "#4CAF50" },
    { type: "dependency", label: "Dependencies", color: "#2196F3" },
    { type: "missing", label: "Missing Dependencies", color: "#f44336" },
  ];

  const legendItems = legend
    .selectAll(".legend-item")
    .data(legendData)
    .enter()
    .append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(20, ${20 + i * 30})`);

  legendItems
    .append("circle")
    .attr("r", 8)
    .attr("fill", (d) => d.color)
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  legendItems
    .append("text")
    .attr("x", 20)
    .attr("y", 5)
    .attr("font-size", "14px")
    .attr("fill", "#333")
    .style("font-weight", "bold")
    .text((d) => d.label);

  // Update positions
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

    labels.attr("x", (d) => d.x).attr("y", (d) => d.y);
  });

  // Drag functions
  function dragstarted(event, d) {
    // Reactivate simulation for smooth movement
    if (!event.active) simulation.alphaTarget(0.3).restart();
    // Fix the dragged node position to prevent it from being pulled by forces
    d.fx = d.x;
    d.fy = d.y;
    d3.select(this).style("cursor", "grabbing");
  }

  function dragged(event, d) {
    // Update fixed position to follow mouse
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    // Deactivate simulation and release the node
    if (!event.active) simulation.alphaTarget(0);
    // Release the node so it can move freely again
    d.fx = null;
    d.fy = null;
    d3.select(this).style("cursor", "grab");
  }

  // Setup fullscreen controls
  setupFullscreenControls(
    svg,
    zoom,
    selectedNodes,
    node,
    updateSelectionDisplay,
    selectionInfoDiv
  );
}

function setupFullscreenControls(
  svg,
  zoom,
  selectedNodes,
  node,
  updateSelectionDisplay,
  selectionInfoDiv
) {
  // Zoom controls
  document.getElementById("zoomInBtn").onclick = () => {
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
  };

  document.getElementById("zoomOutBtn").onclick = () => {
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
  };

  document.getElementById("resetZoomBtn").onclick = () => {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  };

  // Clear selection button
  document.getElementById("clearSelectionBtn").onclick = () => {
    selectedNodes.clear();
    node.attr("stroke", "#fff").attr("stroke-width", 2);
    updateSelectionDisplay();
  };

  // Close button
  document.getElementById("closeFullscreenBtn").onclick = () => {
    // Clear selection and hide modal
    selectedNodes.clear();
    if (node) {
      node.attr("stroke", "#fff").attr("stroke-width", 2);
    }
    if (selectionInfoDiv) {
      selectionInfoDiv.style.display = "none";
    }
    document.getElementById("fullscreenNetworkModal").style.display = "none";
  };

  // Close on escape key and clear selection
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      // Clear selection if any nodes are selected
      if (selectedNodes.size > 0) {
        selectedNodes.clear();
        node.attr("stroke", "#fff").attr("stroke-width", 2);
        updateSelectionDisplay();
      } else {
        document.getElementById("fullscreenNetworkModal").style.display =
          "none";
      }
    }
  });
}
