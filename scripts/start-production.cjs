const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadEnvironment, prepareDatabase } = require("./database-setup.cjs");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
loadEnvironment();

function runNode(script, args, label) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: backend,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

prepareDatabase();
runNode(path.join(backend, "dist", "src", "server.js"), [], "Production server");
