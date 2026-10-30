const fs = require("node:fs");
const path = require("node:path");

const backend = path.join(__dirname, "backend");
process.chdir(backend);

// cPanel's Node.js selector supplies environment variables itself. Loading this
// file as well keeps the same entry point usable on a server managed by SSH.
require(path.join(backend, "node_modules", "dotenv")).config({
  path: path.join(backend, ".env"),
  quiet: true,
});

if (!process.env.DESKTOP_WEB_DIR) process.env.DESKTOP_WEB_DIR = "../frontend/dist";

async function main() {
  const { app } = require(path.join(backend, "dist", "src", "app.js"));
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`Institute Accounts System is running on port ${port}.`);
  });
}

main().catch((error) => {
  const message = `${new Date().toISOString()} ${error instanceof Error ? error.stack || error.message : String(error)}\n`;
  try { fs.appendFileSync(path.join(__dirname, "startup-error.log"), message); } catch {}
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
