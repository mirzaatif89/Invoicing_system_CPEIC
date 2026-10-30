const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: 'file:./data/invoice_app_for_usman.db',
};

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run(npm, ['run', 'build'], 'Desktop build');
run(npm, ['exec', 'electron', '.'], 'Desktop app');
