// Test pour vérifier le calcul du total size
async function testTotalSize() {
  console.log("Testing total size calculation...");

  try {
    const response = await fetch("http://localhost:3000/api/search-mods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchTerms: ["scalp iraq"],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

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
            if (data.type === "complete") {
              finalData = data;
            }
          } catch (error) {
            console.error("Error parsing response:", error);
          }
        }
      }
    }

    if (finalData && finalData.mods) {
      console.log("\n=== BACKEND DATA ===");
      const scalpMod = finalData.mods.find(
        (m) => m.modId === "65E4F7D3626F575A"
      );
      if (scalpMod) {
        console.log("Scalp_PVE_iraq size:", scalpMod.size, "MB");
        console.log(
          "Dependencies count:",
          scalpMod.dependencies ? scalpMod.dependencies.length : 0
        );

        // Simuler la récupération des dépendances
        const dependenciesToFetch = [];
        const seenModIds = new Set();
        seenModIds.add(scalpMod.modId);

        if (scalpMod.dependencies && scalpMod.dependencies.length > 0) {
          for (const dep of scalpMod.dependencies) {
            if (!seenModIds.has(dep.modId)) {
              seenModIds.add(dep.modId);
              dependenciesToFetch.push(dep);
            }
          }
        }

        console.log("\n=== FETCHING DEPENDENCIES ===");
        const dependencyMods = [];
        let totalDependencySize = 0;

        for (const dep of dependenciesToFetch) {
          try {
            const depResponse = await fetch(
              "http://localhost:3000/api/search-mods",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ modId: dep.modId }),
              }
            );

            if (depResponse.ok) {
              const versionData = await depResponse.json();
              if (versionData.success) {
                const depSize = versionData.size || 0;
                totalDependencySize += depSize;
                console.log(`${dep.name}: ${depSize} MB`);
                dependencyMods.push({
                  modId: dep.modId,
                  name: dep.name,
                  version: versionData.version,
                  size: depSize,
                });
              }
            }
          } catch (error) {
            console.error(
              `Failed to get version for ${dep.name}:`,
              error.message
            );
          }
        }

        // Calculer le total final
        const originalSize = scalpMod.size || 0;
        const finalTotalSize = originalSize + totalDependencySize;

        console.log("\n=== SIZE CALCULATION ===");
        console.log("Original mod size:", originalSize, "MB");
        console.log("Dependencies total size:", totalDependencySize, "MB");
        console.log("Final total size:", finalTotalSize, "MB");
        console.log(
          "Final total size formatted:",
          finalTotalSize > 0 ? finalTotalSize.toFixed(1) + " MB" : "Unknown"
        );

        // Afficher toutes les tailles pour vérification
        console.log("\n=== ALL SIZES ===");
        console.log("Scalp_PVE_iraq:", originalSize, "MB");
        dependencyMods.forEach((dep) => {
          console.log(`${dep.name}: ${dep.size} MB`);
        });

        console.log("\n=== SUMMARY ===");
        console.log("Total mods:", 1 + dependencyMods.length);
        console.log("Total size:", finalTotalSize.toFixed(1), "MB");
      }
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testTotalSize();
