const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const dotenv = require(path.join(backend, "node_modules", "dotenv"));

function loadEnvironment() {
  const envFile = path.join(backend, ".env");
  if (!fs.existsSync(envFile)) {
    throw new Error("Missing backend/.env. Create this one environment file before starting the application.");
  }
  dotenv.config({ path: envFile, quiet: true });
  return envFile;
}

function configureDatabaseUrl() {
  const existingUrl = process.env.DATABASE_URL?.trim();
  if (existingUrl) return existingUrl;

  const provider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
  if (provider !== "mysql") {
    throw new Error("Set DATABASE_URL, or configure DATABASE_PROVIDER=mysql with DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD.");
  }

  const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`MySQL is missing required environment values: ${missing.join(", ")}.`);
  }

  const host = process.env.DB_HOST.trim();
  const port = process.env.DB_PORT.trim();
  const database = encodeURIComponent(process.env.DB_NAME.trim());
  const username = encodeURIComponent(process.env.DB_USER.trim());
  const password = encodeURIComponent(process.env.DB_PASSWORD);
  const databaseUrl = `mysql://${username}:${password}@${host}:${port}/${database}`;
  process.env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}

function databaseProfile() {
  const databaseUrl = configureDatabaseUrl();
  const configuredProvider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
  const provider = configuredProvider || (databaseUrl.startsWith("mysql:") ? "mysql" : "sqlite");
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (provider !== "sqlite" && provider !== "mysql") {
    throw new Error("DATABASE_PROVIDER must be either sqlite or mysql.");
  }
  if (provider === "sqlite" && !databaseUrl.startsWith("file:")) {
    throw new Error("SQLite requires a DATABASE_URL starting with file:.");
  }
  if (provider === "mysql" && !databaseUrl.startsWith("mysql:")) {
    throw new Error("MySQL requires a DATABASE_URL starting with mysql:.");
  }
  return {
    provider,
    databaseUrl,
    schema: provider === "mysql"
      ? path.join(backend, "prisma", "mysql", "schema.prisma")
      : path.join(backend, "prisma", "schema.prisma"),
  };
}

function ensureSqliteDirectory(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) return;
  let filePath = databaseUrl.slice("file:".length).split("?")[0];
  if (filePath.startsWith("//")) filePath = decodeURIComponent(new URL(databaseUrl).pathname);
  else filePath = decodeURIComponent(filePath);
  if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(backend, "prisma", filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
}

function runNode(script, args, label) {
  const env = { ...process.env };
  // A machine-wide RUST_LOG=warn breaks the Prisma schema engine on Windows.
  delete env.RUST_LOG;
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: backend,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

function generateClient(profile = databaseProfile()) {
  runNode(
    path.join(backend, "node_modules", "prisma", "build", "index.js"),
    ["generate", "--schema", profile.schema],
    "Prisma client generation",
  );
}

function deployMigrations(profile = databaseProfile()) {
  if (profile.provider === "sqlite") ensureSqliteDirectory(profile.databaseUrl);
  runNode(
    path.join(backend, "node_modules", "prisma", "build", "index.js"),
    ["migrate", "deploy", "--schema", profile.schema],
    "Database migration",
  );
}

function seedDatabase() {
  runNode(
    path.join(backend, "node_modules", "tsx", "dist", "cli.mjs"),
    [path.join(backend, "prisma", "seed.ts")],
    "Database seed",
  );
}

function prepareDatabase() {
  loadEnvironment();
  const profile = databaseProfile();
  console.log(`Preparing ${profile.provider} database.`);
  generateClient(profile);
  deployMigrations(profile);
  seedDatabase();
  console.log("Database is ready.");
  return profile;
}

if (require.main === module) {
  try {
    loadEnvironment();
    const profile = databaseProfile();
    const command = process.argv[2] || "prepare";
    if (command === "generate") generateClient(profile);
    else if (command === "migrate") deployMigrations(profile);
    else if (command === "seed") seedDatabase();
    else if (command === "prepare") prepareDatabase();
    else throw new Error("Use generate, migrate, seed, or prepare.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { loadEnvironment, configureDatabaseUrl, databaseProfile, generateClient, deployMigrations, seedDatabase, prepareDatabase };
