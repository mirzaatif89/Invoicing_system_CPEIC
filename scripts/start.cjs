const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const concurrently = require('concurrently');

const root = path.resolve(__dirname, '..');
require('../backend/node_modules/dotenv').config({ path: path.join(root, 'backend', '.env'), quiet: true });

function portOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function startDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL in backend/.env first.');
  const database = new URL(process.env.DATABASE_URL);
  const port = Number(database.port || 3306);
  if (await portOpen(database.hostname, port)) {
    console.log(`Database already running on port ${port}.`);
    return;
  }
  if (!['127.0.0.1', 'localhost'].includes(database.hostname) || port !== 3307) {
    throw new Error('Configured database is unavailable. Automatic startup supports the local demo database on port 3307.');
  }
  const data = path.join(root, '.local-mysql');
  if (!fs.existsSync(path.join(data, 'mysql'))) throw new Error('Local demo database is missing; initialize it before starting.');
  const executable = process.env.MYSQLD_PATH || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'MySQL', 'MySQL Server 8.0', 'bin', 'mysqld.exe');
  if (!fs.existsSync(executable)) throw new Error('MySQL Server executable not found. Set MYSQLD_PATH in backend/.env.');
  const logPath = path.join(data, 'startup.log');
  const log = fs.openSync(logPath, 'a');
  let startupError;
  let exited = false;
  const server = spawn(executable, [
    '--no-defaults', `--basedir=${path.dirname(path.dirname(executable))}`,
    `--datadir=${data}`, `--port=${port}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', `--log-error=${path.join(data, 'mysql-error.log')}`,
  ], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  fs.closeSync(log);
  server.once('error', (error) => { startupError = error; });
  server.once('exit', () => { exited = true; });
  server.unref();
  console.log('Starting local MySQL database...');
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError) throw startupError;
    if (exited) throw new Error(`MySQL stopped during startup. See ${path.join(data, 'mysql-error.log')}`);
    if (await portOpen(database.hostname, port)) {
      console.log(`Database ready on port ${port}.`);
      return;
    }
    await delay(1000);
  }
  throw new Error(`MySQL startup timed out. See ${logPath}`);
}

async function main() {
  await startDatabase();
  console.log('Project: http://localhost:5173');
  console.log('Ctrl+C stops the web/API servers. MySQL stays running for the next start.');
  const { result } = concurrently([
    { command: 'npm run dev --prefix backend', name: 'API', prefixColor: 'blue' },
    { command: 'npm run dev --prefix frontend -- --strictPort', name: 'WEB', prefixColor: 'green' },
  ], { cwd: root, killOthersOn: ['failure', 'success'] });
  await result;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Project servers stopped.');
  process.exitCode = 1;
});
