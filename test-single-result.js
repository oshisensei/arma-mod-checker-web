// Using native fetch (Node.js 18+)

async function testSingleResult() {
  console.log("Testing single result search...");

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
            console.log("Received:", data.type, data);

            if (data.type === "complete" && data.mods) {
              console.log("\nFinal JSON:");
              console.log(JSON.stringify(data.mods, null, 2));

              // Check if dependencies are included
              const hasDependencies = data.mods.some(
                (mod) =>
                  mod.modId === "65E4F7D3626F575A" && mod.version !== "Unknown"
              );

              console.log(
                "\nTest result:",
                hasDependencies ? "✅ SUCCESS" : "❌ FAILED"
              );
              console.log(
                "Expected: Scalp_PVE_iraq with version and dependencies"
              );
              console.log("Actual:", data.mods.length, "mods found");
            }
          } catch (error) {
            console.error("Error parsing response:", error);
          }
        }
      }
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testSingleResult();
