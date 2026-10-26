const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog } = require('electron');

const productName = 'Institute Accounts System';
const customUserDataPath = process.env.INSTITUTE_ACCOUNTS_USER_DATA_DIR;
app.setPath(
  'userData',
  customUserDataPath
    ? path.resolve(customUserDataPath)
    : path.join(app.getPath('appData'), `${productName} Desktop`),
);
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow;
let apiProcess;
let shuttingDown = false;
let allowQuit = false;
let logFile;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* app data may not exist yet */ }
  try { process.stdout.write(line); } catch { /* packaged GUI builds may have no console */ }
}

function appPath(...parts) {
  return path.join(app.getAppPath(), ...parts);
}

function unpackedPath(...parts) {
  if (!app.isPackaged) return appPath(...parts);
  return path.join(process.resourcesPath, 'app.asar.unpacked', ...parts);
}

function prismaSchemaEnginePath() {
  const candidates = [
    ['backend', 'node_modules', 'prisma', 'node_modules', '@prisma', 'engines', 'schema-engine-windows.exe'],
    ['backend', 'node_modules', '@prisma', 'engines', 'schema-engine-windows.exe'],
  ];
  const existing = candidates.map((parts) => unpackedPath(...parts)).find((candidate) => fs.existsSync(candidate));
  return existing || unpackedPath(...candidates[0]);
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const sourcePath = path.join(source, name);
    const destinationPath = path.join(destination, name);
    if (fs.statSync(sourcePath).isDirectory()) copyDirectory(sourcePath, destinationPath);
    else fs.writeFileSync(destinationPath, fs.readFileSync(sourcePath));
  }
}

function readConfig(configPath) {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return undefined; }
}

function writeConfig(configPath, config) {
  const temporary = `${configPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, configPath);
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(executable)} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function tcpOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function apiHealthy(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 700 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(response.statusCode === 200 && JSON.parse(body).status === 'ok'); }
        catch { resolve(false); }
      });
    });
    request.once('error', () => resolve(false));
    request.once('timeout', () => request.destroy());
  });
}

function runNode(modulePath, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [modulePath, ...args], {
      ...options,
      env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const capture = (chunk) => {
      const value = chunk.toString();
      output += value;
      log(value.trimEnd());
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? resolve(output)
      : reject(new Error(`${path.basename(modulePath)} exited with code ${code}.${output ? `\n${output}` : ''}`)));
  });
}

async function migrateAndSeed(config) {
  const backend = appPath('backend');
  const userData = app.getPath('userData');
  const dataDirectory = path.join(userData, 'data');
  const databasePath = path.join(dataDirectory, 'invoice_app_for_usman.db');
  fs.mkdirSync(dataDirectory, { recursive: true });

  const bundledPrisma = appPath('backend', 'prisma');
  const bundledMigrations = path.join(bundledPrisma, 'migrations');
  if (!fs.existsSync(bundledMigrations)) throw new Error('Prisma SQLite migrations are missing from this desktop build.');

  // Prisma migrations need a physical schema path in packaged builds.
  const runtimePrisma = path.join(userData, 'runtime-prisma');
  fs.rmSync(runtimePrisma, { recursive: true, force: true });
  fs.mkdirSync(runtimePrisma, { recursive: true });
  fs.writeFileSync(path.join(runtimePrisma, 'schema.prisma'), fs.readFileSync(path.join(bundledPrisma, 'schema.prisma')));
  copyDirectory(bundledMigrations, path.join(runtimePrisma, 'migrations'));
  const schema = path.join(runtimePrisma, 'schema.prisma');
  const apiPort = config.apiPort;
  const env = {
    ...process.env,
    PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter),
    NODE_ENV: 'production',
    DATABASE_URL: decodeURIComponent(pathToFileURL(databasePath).href).replace(/^file:\/\/\/([A-Za-z]:\/)/i, 'file:$1'),
    JWT_SECRET: config.jwtSecret,
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    CORS_ORIGIN: `http://127.0.0.1:${apiPort}`,
    DESKTOP_WEB_DIR: app.isPackaged
      ? unpackedPath('frontend', 'dist')
      : appPath('frontend', 'dist'),
    PRISMA_SCHEMA_ENGINE_BINARY: prismaSchemaEnginePath(),
    PRISMA_QUERY_ENGINE_LIBRARY: unpackedPath('backend', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
  };
  const prismaCli = appPath('backend', 'node_modules', 'prisma', 'build', 'index.js');
  const workingDirectory = app.isPackaged ? userData : backend;
  const migrationEnv = { ...env };
  delete migrationEnv.RUST_LOG;

  log(`Preparing the local SQLite database at ${databasePath}.`);
  await runNode(prismaCli, ['migrate', 'deploy', '--schema', schema], {
    cwd: workingDirectory,
    env: migrationEnv,
  });

  log('Creating the first administrator account when needed.');
  await runNode(appPath('desktop', 'seed.cjs'), [], {
    cwd: workingDirectory,
    env: { ...env, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'ChangeMe123!' },
  });
  return env;
}

function waitForApi(port, child) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error(`The application API did not become ready. See ${logFile}`));
    }, 90_000);
    child.once('exit', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(`The application API stopped during startup (code ${code}). See ${logFile}`));
    });

    const probe = async () => {
      if (await apiHealthy(port)) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve();
        }
        return;
      }
      if (!finished) setTimeout(probe, 500);
    };
    void probe();
  });
}

async function startApi(env) {
  const backend = appPath('backend');
  const server = path.join(backend, 'dist', 'src', 'server.js');
  if (!fs.existsSync(server)) throw new Error('Compiled backend is missing. Build the desktop package again.');
  apiProcess = spawn(process.execPath, [server], {
    cwd: app.isPackaged ? app.getPath('userData') : backend,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout?.on('data', (chunk) => log(chunk.toString().trimEnd()));
  apiProcess.stderr?.on('data', (chunk) => log(chunk.toString().trimEnd()));
  apiProcess.once('error', (error) => log(`API process error: ${error.message}`));
  await waitForApi(Number(env.PORT), apiProcess);
  log(`Application API ready at http://127.0.0.1:${env.PORT}.`);
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f7f6',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

async function startApp() {
  if (!gotLock) return;
  await app.whenReady();
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  logFile = path.join(userData, 'desktop-startup.log');
  log(`${productName} desktop is starting.`);

  const configPath = path.join(userData, 'desktop-config.json');
  const config = readConfig(configPath) || {};
  config.jwtSecret ||= crypto.randomBytes(48).toString('hex');
  if (!Number.isInteger(config.apiPort)) config.apiPort = await getFreePort();
  if (await tcpOpen(config.apiPort)) config.apiPort = await getFreePort();
  writeConfig(configPath, config);

  const env = await migrateAndSeed(config);
  await startApi(env);
  await createWindow(config.apiPort);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (apiProcess?.pid) {
    const exited = new Promise((resolve) => apiProcess.once('exit', resolve));
    apiProcess.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (allowQuit) return;
  event.preventDefault();
  void shutdown().finally(() => {
    allowQuit = true;
    app.quit();
  });
});

startApp().catch((error) => {
  log(`Startup failed: ${error.stack || error.message}`);
  if (app.isReady()) {
    dialog.showErrorBox(`${productName} could not start`, `${error.message}\n\nDetails: ${logFile || app.getPath('userData')}`);
    app.quit();
  } else {
    app.whenReady().then(() => {
      dialog.showErrorBox(`${productName} could not start`, error.message);
      app.quit();
    });
  }
});
