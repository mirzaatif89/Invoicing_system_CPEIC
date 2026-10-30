const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const env = { ...process.env };
// Desktop builds always bundle the local SQLite Prisma client. Server MySQL
// configuration must not change the portable app database provider.
env.DATABASE_PROVIDER = 'sqlite';
env.DATABASE_URL = 'file:./data/invoice_app_for_usman.db';
if (process.platform === 'win32') {
  const windowsPowerShell = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0');
  env.PATH = `${windowsPowerShell};${env.PATH || ''}`;
  env.ELECTRON_BUILDER_COMPRESSION_LEVEL ||= '3';
}
delete env.ELECTRON_RUN_AS_NODE;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function runNpm(script) {
  if (process.platform === 'win32') {
    run(env.ComSpec || path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), ['/d', '/s', '/c', `npm run ${script}`]);
  } else {
    run('npm', ['run', script]);
  }
}

runNpm('build');
run(process.execPath, [
  path.join(root, 'node_modules', 'electron-builder', 'cli.js'),
  '--win', 'portable', '--x64', '--config', 'desktop/electron-builder.yml',
]);
