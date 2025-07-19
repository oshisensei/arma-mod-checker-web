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
      const response = await fetch("/api/check-mods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mods: configData.game.mods,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
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
  const results = data.results;

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
  showDependencyNetwork(results);
  showDetailedResults(results);

  document
    .getElementById("resultsSection")
    .scrollIntoView({ behavior: "smooth" });
}

function showSizeAnalysis(results) {
  const modsWithSize = results.filter((r) => r.size > 0);
  const totalSize = modsWithSize.reduce((sum, mod) => sum + mod.size, 0);
  const averageSize = totalSize / modsWithSize.length;
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
        <div style="background: rgba(33, 150, 243, 0.1); padding: 15px; border-radius: 8px; text-align: center;">
            <h4 style="margin: 0 0 10px 0; color: #2196F3;">📊 Average Size</h4>
            <p style="font-size: 1.8rem; font-weight: bold; margin: 0;">${averageSize.toFixed(
              1
            )} MB</p>
            <p style="font-size: 0.9rem; opacity: 0.8; margin: 5px 0 0 0;">per mod</p>
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

  const width = container.offsetWidth || 800;
  const height = 400;

  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  // Add your mods as nodes
  results.forEach((mod) => {
    const node = {
      id: mod.modId,
      name: mod.name,
      type: "your-mod",
      size: mod.size || 1,
      status: mod.status,
      dependencies: mod.dependencies.length,
    };
    nodes.push(node);
    nodeMap.set(mod.modId, node);
  });

  // Add dependencies and links
  results.forEach((mod) => {
    mod.dependencies.forEach((dep) => {
      if (!nodeMap.has(dep.modId)) {
        const depNode = {
          id: dep.modId,
          name: dep.name,
          type: "dependency",
          size: 1,
          status: "dependency",
          dependencies: 0,
        };
        nodes.push(depNode);
        nodeMap.set(dep.modId, depNode);
      }

      links.push({
        source: mod.modId,
        target: dep.modId,
        type: "dependency",
      });
    });

    // Add missing dependencies
    mod.dependencyCheck.missing.forEach((dep) => {
      if (!nodeMap.has(dep.modId)) {
        const missingNode = {
          id: dep.modId,
          name: dep.name,
          type: "missing",
          size: 1,
          status: "missing",
          dependencies: 0,
        };
        nodes.push(missingNode);
        nodeMap.set(dep.modId, missingNode);
      }

      links.push({
        source: mod.modId,
        target: dep.modId,
        type: "missing",
      });
    });
  });

  // Create SVG
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Create simulation
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(100)
    )
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2));

  // Create links
  const link = svg
    .append("g")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", (d) => (d.type === "missing" ? "#f44336" : "#666"))
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-dasharray", (d) => (d.type === "missing" ? "5,5" : "none"));

  // Create nodes
  const node = svg
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("r", (d) => Math.sqrt(d.size) * 3 + 5)
    .attr("fill", (d) => {
      switch (d.type) {
        case "your-mod":
          return "#4CAF50";
        case "dependency":
          return "#ff9800";
        case "missing":
          return "#f44336";
        default:
          return "#666";
      }
    })
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
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
      d.name.length > 15 ? d.name.substring(0, 12) + "..." : d.name
    )
    .attr("font-size", "12px")
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
        `${d.name}\\nType: ${d.type}\\nSize: ${
          d.size ? d.size.toFixed(1) + " MB" : "Unknown"
        }\\nDependencies: ${d.dependencies}`
    );

  // Update positions
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node
      .attr("cx", (d) => Math.max(20, Math.min(width - 20, d.x)))
      .attr("cy", (d) => Math.max(20, Math.min(height - 20, d.y)));

    labels
      .attr("x", (d) => Math.max(20, Math.min(width - 20, d.x)))
      .attr("y", (d) => Math.max(20, Math.min(height - 20, d.y)));
  });

  // Drag functions
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
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
}

function showModDetails(nodeData, allResults) {
  const modData = allResults.find((r) => r.modId === nodeData.id);

  let detailHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                    background: rgba(0,0,0,0.9); padding: 20px; border-radius: 10px; 
                    max-width: 500px; z-index: 1000; color: white; max-height: 80vh; overflow-y: auto;">
            <h3 style="margin-top: 0;">${nodeData.name}</h3>
            <p><strong>Type:</strong> ${nodeData.type}</p>
            <p><strong>Size:</strong> ${
              nodeData.size ? nodeData.size.toFixed(1) + " MB" : "Unknown"
            }</p>
    `;

  if (modData) {
    detailHTML += `
            <p><strong>Status:</strong> ${modData.status}</p>
            <p><strong>Version:</strong> ${modData.version} → ${modData.currentVersion}</p>
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

    if (modData.dependencyCheck.missing.length > 0) {
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
