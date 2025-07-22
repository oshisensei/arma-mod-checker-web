import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Set development mode
process.env.DEV_MODE = process.env.DEV_MODE || "true";

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// API routes for local development
app.post("/api/check-mods", async (req, res) => {
  try {
    const { default: handler } = await import("./api/check-mods.js");
    await handler(req, res);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

app.post("/api/check-mods-simple", async (req, res) => {
  try {
    const { default: handler } = await import("./api/check-mods-simple.js");
    await handler(req, res);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

app.post("/api/search-mods", async (req, res) => {
  try {
    const { default: handler } = await import("./api/search-mods.js");
    await handler(req, res);
  } catch (error) {
    console.error("Search API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Serve index.html for all other GET routes (SPA support)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔧 Mode: ${process.env.DEV_MODE === "true" ? "MOCK" : "REAL"}`);
});
