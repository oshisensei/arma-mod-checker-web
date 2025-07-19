// Test script for production API (without mock data)
import fetch from "node-fetch";

const testMods = [
  {
    modId: "65933C74B33C5B63",
    name: "7e LFE USSR Variant Insurgent",
    version: "1.0.2",
  },
];

async function testProductionAPI() {
  try {
    console.log("Testing production API with real Arma Reforger data...");

    const response = await fetch("http://localhost:3000/api/check-mods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mods: testMods }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP error! status: ${response.status}, body: ${errorText}`
      );
    }

    const data = await response.text();
    console.log("API Response:", data);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testProductionAPI();
