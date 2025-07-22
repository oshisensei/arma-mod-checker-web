// Test complet du flux de recherche avec un seul résultat
async function testCompleteFlow() {
  console.log("Testing complete search flow...");

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
      console.log("\n=== FINAL RESULT ===");
      console.log("Total mods:", finalData.mods.length);

      // Check if Scalp_PVE_iraq has correct version
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
          console.log("✅ Dependencies found:");
          scalpMod.dependencies.forEach((dep) => {
            console.log(`   - ${dep.name} (${dep.modId})`);
          });
        }
      } else {
        console.log("❌ Scalp_PVE_iraq not found in results");
      }

      // Check if all dependencies are included as separate mods
      const allModIds = finalData.mods.map((m) => m.modId);
      const expectedDeps = [
        "1337C0DE5DABBEEF", // RHS - Content Pack 01
        "595F2BF2F44836FB", // RHS - Status Quo
        "5994AD5A9F33BE57", // Game Master FX
        "61A56756149009FF", // Iraq 1990
        "61B514B96692C049", // ConflictPVERemixedVanilla2.0
        "629B2BA37EFFD577", // WCS_Armaments
        "62D917B13CD81F69", // CHAR LECLERC - FRM
        "62E9569DFB3C3DCB", // VAB VTT
        "63294BA2D9F0339B", // WCS_ZU-23-2
        "64706CF53044CC66", // EUROCOPTER EC 665 TIGRE
        "64D939067B71E0BB", // EC665 Tigre WCS
        "64F8EC80FDC4AD1A", // ATM_Uniforms
        "655A5999AC216F33", // DarkGru G3s
        "656B1BE66E36712B", // Iraq PvE
        "BADC0DEDABBEDA5E", // RHS - Content Pack 02
      ];

      console.log("\n=== DEPENDENCY CHECK ===");
      let missingDeps = 0;
      for (const depId of expectedDeps) {
        if (allModIds.includes(depId)) {
          const depMod = finalData.mods.find((m) => m.modId === depId);
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
          "🎉 SUCCESS: All dependencies are included as separate mods!"
        );
      } else {
        console.log(
          "⚠️  WARNING: Some dependencies are missing from the final JSON"
        );
      }
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testCompleteFlow();
