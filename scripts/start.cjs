const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const concurrently = require('concurrently');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
require('../backend/node_modules/dotenv').config({ path: path.join(backend, '.env'), quiet: true });

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

function runNodeScript(script, args, label, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: backend,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
}

function sqliteFileFromUrl(schemaPath) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('Set DATABASE_URL in backend/.env to a SQLite file URL (for example file:./data/invoice_app_for_usman.db).');
  }

  let filePath = databaseUrl.slice('file:'.length).split('?')[0];
  if (filePath.startsWith('//')) filePath = decodeURIComponent(new URL(databaseUrl).pathname);
  else filePath = decodeURIComponent(filePath);
  if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);

  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(path.dirname(schemaPath), filePath);
}

async function prepareDatabase() {
  const schema = path.join(backend, 'prisma', 'schema.prisma');
  if (!require('node:fs').existsSync(schema)) throw new Error(`Prisma schema is missing: ${schema}`);
  const databaseFile = sqliteFileFromUrl(schema);
  require('node:fs').mkdirSync(path.dirname(databaseFile), { recursive: true });

  console.log(`Applying SQLite migrations to ${databaseFile}.`);
  const migrationEnv = { ...process.env };
  delete migrationEnv.RUST_LOG;
  runNodeScript(path.join(backend, 'node_modules', 'prisma', 'build', 'index.js'), [
    'migrate', 'deploy', '--schema', schema,
  ], 'SQLite migration', migrationEnv);
  runNodeScript(path.join(backend, 'node_modules', 'tsx', 'dist', 'cli.mjs'), [
    path.join(backend, 'prisma', 'seed.ts'),
  ], 'Database seed');
  console.log('SQLite database is ready.');
}

async function startWebAndApi() {
  const apiPort = Number(process.env.PORT || 4000);
  const webPort = 5173;
  const apiAlreadyRunning = await portOpen('localhost', apiPort);
  const webAlreadyRunning = await portOpen('localhost', webPort);

  if (apiAlreadyRunning && webAlreadyRunning) {
    console.log(`API already running on http://localhost:${apiPort}.`);
    console.log(`Project already running on http://localhost:${webPort}.`);
    await new Promise((resolve) => {
      const keepAlive = setInterval(() => {}, 60_000);
      const stop = () => {
        clearInterval(keepAlive);
        resolve();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return;
  }

  const commands = [];
  if (!apiAlreadyRunning) commands.push({ command: 'npm run dev --prefix backend', name: 'API', prefixColor: 'blue' });
  else {
    let healthy = false;
    try {
      const response = await fetch(`http://localhost:${apiPort}/api/health`);
      healthy = response.ok && (await response.json()).status === 'ok';
    } catch { /* An occupied port may belong to an old or unrelated process. */ }
    if (!healthy) throw new Error(`Port ${apiPort} is occupied by an API that cannot reach the configured database. Stop the old server, then run npm start again.`);
    console.log(`API already running on port ${apiPort}.`);
  }
  if (!webAlreadyRunning) commands.push({ command: 'npm run dev --prefix frontend -- --strictPort', name: 'WEB', prefixColor: 'green' });
  else console.log(`Frontend already running on port ${webPort}.`);

  console.log('Project: http://localhost:5173');
  console.log('Ctrl+C stops the web/API servers. The SQLite database is a local file and needs no background service.');
  const { result } = concurrently(commands, { cwd: root, killOthersOn: ['failure', 'success'] });
  await result;
}

async function main() {
  await prepareDatabase();
  await startWebAndApi();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Project servers stopped.');
  process.exitCode = 1;
});
