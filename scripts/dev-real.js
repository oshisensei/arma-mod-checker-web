import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🌐 Starting development server with REAL NETWORK CALLS...\n");
console.log("⚠️  This will make actual HTTP requests to mod websites\n");

// Set environment variables for real mode
process.env.DEV_MODE = "false";
process.env.NODE_ENV = "production";

// Start the server
const serverPath = path.join(__dirname, "..", "server.js");
const server = spawn("node", [serverPath], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  env: {
    ...process.env,
    DEV_MODE: "false",
    NODE_ENV: "production",
  },
});

// Wait a bit for server to start
setTimeout(() => {
  console.log("\n🌐 Opening browser...");

  // Try to open browser
  const platform = process.platform;
  let command;

  if (platform === "darwin") {
    command = "open";
  } else if (platform === "win32") {
    command = "start";
  } else {
    command = "xdg-open";
  }

  const browser = spawn(command, ["http://localhost:3000"], {
    stdio: "ignore",
  });

  browser.on("error", () => {
    console.log("💡 Please open http://localhost:3000 in your browser");
  });
}, 2000);

// Handle server exit
server.on("close", (code) => {
  console.log(`\n🛑 Server stopped with code ${code}`);
  process.exit(code);
});

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down development server...");
  server.kill("SIGINT");
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down development server...");
  server.kill("SIGTERM");
});
