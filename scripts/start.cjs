const path = require('node:path');
const net = require('node:net');
const concurrently = require('concurrently');
const { loadEnvironment, databaseProfile, prepareDatabase: prepareConfiguredDatabase } = require('./database-setup.cjs');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
loadEnvironment();

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

async function prepareDatabase() {
  const profile = databaseProfile();
  console.log(`Using ${profile.provider} database.`);
  prepareConfiguredDatabase();
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
  console.log('Ctrl+C stops the web/API servers. Database settings are read from the selected environment file.');
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
