import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const env = { ...process.env };

if (process.platform === "win32") {
  const windir = env.WINDIR || env.SystemRoot || "C:\\Windows";
  const system32 = `${windir}\\System32`;
  const cmdPath = `${system32}\\cmd.exe`;

  const currentPath = env.Path || env.PATH || "";
  const nextPath = currentPath.toLowerCase().includes(system32.toLowerCase())
    ? currentPath
    : `${system32};${currentPath}`;

  env.Path = nextPath;
  env.PATH = nextPath;
  env.ComSpec = cmdPath;
  env.COMSPEC = cmdPath;
}

const localVercelJs = path.resolve("node_modules", "vercel", "dist", "vc.js");
const localVercelCmd = path.resolve("node_modules", ".bin", "vercel.cmd");
const localVercel = path.resolve("node_modules", ".bin", "vercel");

let command = "npx";
let args = ["vercel", "dev"];
let shell = true;

if (fs.existsSync(localVercelJs)) {
  command = process.execPath;
  args = [localVercelJs, "dev"];
  shell = false;
} else if (process.platform === "win32" && fs.existsSync(localVercelCmd)) {
  command = localVercelCmd;
  args = ["dev"];
  shell = true;
} else if (process.platform !== "win32" && fs.existsSync(localVercel)) {
  command = localVercel;
  args = ["dev"];
  shell = false;
}

const child = spawn(command, args, {
  stdio: "inherit",
  env,
  shell,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("Failed to start Vercel dev:", err);
  process.exit(1);
});
