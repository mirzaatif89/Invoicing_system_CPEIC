const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

// cPanel runs lifecycle scripts with the Node virtual-environment directory as
// the working directory. Resolve every path from this file instead.
const root = path.resolve(__dirname, "..");
const bundledNpmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmCli = process.env.npm_execpath || (fs.existsSync(bundledNpmCli) ? bundledNpmCli : "");

function npm(args, label) {
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    // cPanel supplies npm_execpath. The fallback supports a direct local check.
    shell: process.platform === "win32" && !npmCli,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

npm(["--prefix", path.join(root, "backend"), "ci", "--include=dev"], "Backend dependency install");

// Shared cPanel plans can have a very low process/thread limit. Vite/esbuild
// exceeds that limit while compiling the frontend, so the deployment archive
// contains prebuilt backend and frontend assets. Only generate the Prisma
// client here, on the Linux host, so its native engine matches the server.
const backendApp = path.join(root, "backend", "dist", "src", "app.js");
const frontendIndex = path.join(root, "frontend", "dist", "index.html");
if (!fs.existsSync(backendApp) || !fs.existsSync(frontendIndex)) {
  throw new Error("This cPanel package must include backend/dist and frontend/dist.");
}
npm(["--prefix", path.join(root, "backend"), "run", "prisma:generate"], "Prisma client generation");
npm(["--prefix", path.join(root, "backend"), "run", "db:deploy"], "Database migration");
npm(["--prefix", path.join(root, "backend"), "run", "db:seed"], "Database seed");
