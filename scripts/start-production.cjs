const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const envFile = path.join(backend, ".env");

if (!fs.existsSync(envFile)) {
  throw new Error("Missing backend/.env. Copy backend/.env.production.example to backend/.env and set JWT_SECRET and CORS_ORIGIN.");
}

require(path.join(backend, "node_modules", "dotenv")).config({ path: envFile, quiet: true });

function runNode(script, args, label) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: backend,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

const schema = path.join(backend, "prisma", "schema.prisma");
runNode(
  path.join(backend, "node_modules", "prisma", "build", "index.js"),
  ["migrate", "deploy", "--schema", schema],
  "Database migration",
);
runNode(
  path.join(backend, "node_modules", "tsx", "dist", "cli.mjs"),
  [path.join(backend, "prisma", "seed.ts")],
  "Database seed",
);
runNode(path.join(backend, "dist", "src", "server.js"), [], "Production server");
