let configData = null;
let checkResults = null;

// Tab switching functionality
function switchTab(tab) {
  document.getElementById("uploadTab").classList.remove("active");
  document.getElementById("pasteTab").classList.remove("active");
  document.getElementById(tab + "Tab").classList.add("active");

  document.getElementById("uploadSection").classList.remove("active");
  document.getElementById("pasteSection").classList.remove("active");
  document.getElementById(tab + "Section").classList.add("active");

  resetConfigState();
}

// Reset configuration state
function resetConfigState() {
  configData = null;
  document.getElementById("fileInfo").style.display = "none";
  document.getElementById("checkButton").disabled = true;
  document.getElementById("configFile").value = "";
  document.getElementById("configText").value = "";
}

// Parse JSON from textarea
function parseJsonText() {
  const jsonText = document.getElementById("configText").value.trim();

  if (!jsonText) {
    showError("Please enter JSON content");
    return;
  }

  try {
    configData = JSON.parse(jsonText);
    if (configData.game && configData.game.mods) {
      const modCount = configData.game.mods.length;
      document.getElementById("configSource").textContent =
        "Pasted JSON content";
      document.getElementById("modCount").textContent = modCount;
      document.getElementById("fileInfo").style.display = "block";
      document.getElementById("checkButton").disabled = false;

      showSuccess(`Successfully parsed JSON with ${modCount} mods`);
    } else {
      throw new Error("Invalid config format");
    }
  } catch (error) {
    showError("Invalid JSON format or missing game.mods array");
    configData = null;
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
          document.getElementById("checkButton").disabled = false;
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

// Check mods button
document
  .getElementById("checkButton")
  .addEventListener("click", async function () {
    if (!configData) return;

    const button = this;
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="loading"></span>Checking...';
    button.disabled = true;

    document.getElementById("progressSection").style.display = "block";
    document.getElementById("resultsSection").style.display = "none";

    try {
      // Determine the correct API URL based on environment
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const apiUrl = isLocalhost
        ? "/api/check-mods"
        : `${window.location.origin}/api/check-mods`;

      console.log("Using API URL:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mods: configData.game.mods,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error Response:", errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      // Check if we have too many mods
      if (configData.game.mods.length > 20) {
        showError(
          `Warning: Only the first 20 mods will be processed due to Vercel timeout limits. You have ${configData.game.mods.length} mods.`
        );
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

function showResults(data) {
  document.getElementById("progressSection").style.display = "none";
  document.getElementById("resultsSection").style.display = "block";

  const summary = data.summary;
  // Handle both data.results and direct results array
  const results = data.results || data;

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
    mod.dependencies.forEach((dep) => {
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
