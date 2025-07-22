// Test qui simule le comportement de l'interface web
async function testWebInterface() {
  console.log("Testing web interface behavior...");

  try {
    // Simuler la recherche "scalp iraq"
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
            console.log("Received:", data.type);

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
      console.log("\n=== BACKEND RESULT ===");
      console.log("Total mods from backend:", finalData.mods.length);

      const scalpMod = finalData.mods.find(
        (m) => m.modId === "65E4F7D3626F575A"
      );
      if (scalpMod) {
        console.log("✅ Scalp_PVE_iraq found with version:", scalpMod.version);
        console.log(
          "✅ Dependencies count:",
          scalpMod.dependencies ? scalpMod.dependencies.length : 0
        );

        if (scalpMod.dependencies && scalpMod.dependencies.length > 0) {
          console.log("✅ Dependencies found in backend:");
          scalpMod.dependencies.forEach((dep) => {
            console.log(`   - ${dep.name} (${dep.modId})`);
          });
        }
      }

      // Maintenant, simuler ce que fait le frontend
      console.log("\n=== FRONTEND SIMULATION ===");

      // Simuler la logique de showSearchResults
      const dependenciesToFetch = [];
      const seenModIds = new Set();

      for (const mod of finalData.mods) {
        seenModIds.add(mod.modId);

        if (mod.dependencies && mod.dependencies.length > 0) {
          for (const dep of mod.dependencies) {
            if (!seenModIds.has(dep.modId)) {
              seenModIds.add(dep.modId);

              // Check if this dependency is already in our mods list
              const existingDep = finalData.mods.find(
                (m) => m.modId === dep.modId
              );
              if (!existingDep) {
                dependenciesToFetch.push(dep);
              }
            }
          }
        }
      }

      console.log(`Dependencies to fetch: ${dependenciesToFetch.length}`);

      if (dependenciesToFetch.length > 0) {
        console.log("Fetching versions for dependencies...");

        // Simuler les appels API pour récupérer les versions des dépendances
        const dependencyMods = [];
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
                dependencyMods.push({
                  modId: dep.modId,
                  name: dep.name,
                  version: versionData.version,
                  dependencies: versionData.dependencies || [],
                  size: versionData.size || 0,
                });
                console.log(`✅ ${dep.name}: ${versionData.version}`);
              } else {
                dependencyMods.push({
                  modId: dep.modId,
                  name: dep.name,
                  version: "Unknown",
                  dependencies: [],
                  size: 0,
                });
                console.log(`❌ ${dep.name}: Unknown version`);
              }
            } else {
              dependencyMods.push({
                modId: dep.modId,
                name: dep.name,
                version: "Unknown",
                dependencies: [],
                size: 0,
              });
              console.log(`❌ ${dep.name}: HTTP error`);
            }
          } catch (error) {
            console.error(
              `Failed to get version for ${dep.name}:`,
              error.message
            );
            dependencyMods.push({
              modId: dep.modId,
              name: dep.name,
              version: "Unknown",
              dependencies: [],
              size: 0,
            });
          }
        }

        // Combiner les mods originales avec les dépendances
        const allMods = [...finalData.mods, ...dependencyMods];

        // Traiter les mods pour le JSON final
        const processedMods = [];
        const processedModIds = new Set();

        for (const mod of allMods) {
          if (processedModIds.has(mod.modId)) {
            continue;
          }
          processedModIds.add(mod.modId);

          const cleanMod = {
            modId: mod.modId,
            name: mod.name,
            version: mod.version,
          };

          processedMods.push(cleanMod);
        }

        // Trier par nom
        const sortedMods = processedMods.sort((a, b) =>
          a.name.localeCompare(b.name, "en", { sensitivity: "base" })
        );

        console.log("\n=== FINAL JSON RESULT ===");
        console.log("Total mods in final JSON:", sortedMods.length);

        // Vérifier si toutes les dépendances sont présentes
        const allModIds = sortedMods.map((m) => m.modId);
        const expectedDeps = [
          "1337C0DE5DABBEEF",
          "595F2BF2F44836FB",
          "5994AD5A9F33BE57",
          "61A56756149009FF",
          "61B514B96692C049",
          "629B2BA37EFFD577",
          "62D917B13CD81F69",
          "62E9569DFB3C3DCB",
          "63294BA2D9F0339B",
          "64706CF53044CC66",
          "64D939067B71E0BB",
          "64F8EC80FDC4AD1A",
          "655A5999AC216F33",
          "656B1BE66E36712B",
          "BADC0DEDABBEDA5E",
        ];

        let missingDeps = 0;
        for (const depId of expectedDeps) {
          if (allModIds.includes(depId)) {
            const depMod = sortedMods.find((m) => m.modId === depId);
            console.log(
              `✅ ${depMod.name} (${depId}) - Version: ${depMod.version}`
            );
          } else {
            console.log(`❌ Missing dependency: ${depId}`);
            missingDeps++;
          }
        }

        console.log(`\n=== SUMMARY ===`);
        console.log(`Expected dependencies: ${expectedDeps.length}`);
        console.log(`Found dependencies: ${expectedDeps.length - missingDeps}`);
        console.log(`Missing dependencies: ${missingDeps}`);

        if (missingDeps === 0) {
          console.log(
            "🎉 SUCCESS: All dependencies are included in the final JSON!"
          );
        } else {
          console.log(
            "⚠️  WARNING: Some dependencies are missing from the final JSON"
          );
        }

        // Afficher le JSON final
        const jsonOutput = { mods: sortedMods };
        console.log("\n=== FINAL JSON ===");
        console.log(JSON.stringify(jsonOutput, null, 2));
      }
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testWebInterface();
