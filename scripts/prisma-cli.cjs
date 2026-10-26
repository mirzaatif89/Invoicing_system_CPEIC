const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const cli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js');
const env = { ...process.env };

// A machine-wide RUST_LOG=warn breaks the Prisma schema engine on Windows.
delete env.RUST_LOG;

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: backend,
  env,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
