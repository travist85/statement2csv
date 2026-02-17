import path from "node:path";
import { spawn } from "node:child_process";

const port = process.env.PORT || "5173";
const viteCliPath = path.resolve("node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [viteCliPath, "--port", port], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("Failed to run Vite dev server:", err);
  process.exit(1);
});
