// Simple test script for the API
import fetch from "node-fetch";

const testMods = [
  {
    modId: "65933C74B33C5B63",
    name: "7e LFE USSR Variant Insurgent",
    version: "1.0.2",
  },
  {
    modId: "60C4CE4888FF4621",
    name: "ACE Core",
    version: "1.3.2",
  },
];

async function testAPI() {
  try {
    console.log("Testing API with mock data...");

    const response = await fetch("http://localhost:3000/api/check-mods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mods: testMods }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    console.log("API Response:", data);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testAPI();
