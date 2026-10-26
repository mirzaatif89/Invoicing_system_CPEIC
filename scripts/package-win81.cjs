const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const stageRoot = path.join(root, '.build-win81');
const appRoot = path.join(stageRoot, 'app');
const backendRoot = path.join(appRoot, 'backend');
const releaseRoot = path.join(root, 'release', 'Windows-8.1');
const electronBuilder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const env = { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '3' };
delete env.ELECTRON_RUN_AS_NODE;
if (process.platform === 'win32') {
  const windowsPowerShell = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0');
  env.PATH = `${windowsPowerShell};${env.PATH || ''}`;
}

if (path.dirname(stageRoot) !== root || path.basename(stageRoot) !== '.build-win81') {
  throw new Error(`Refusing to use unexpected staging path: ${stageRoot}`);
}

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed with exit code ${result.status}`);
}

function runNpm(args, cwd) {
  const command = env.ComSpec || path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
  const commandLine = ['npm', ...args].map((value) => /[\s"&|<>^]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value).join(' ');
  run(command, ['/d', '/s', '/c', commandLine], cwd);
}

function copyFolder(source, destination, filter) {
  fs.cpSync(source, destination, { recursive: true, filter });
}

fs.rmSync(stageRoot, { recursive: true, force: true });
fs.mkdirSync(appRoot, { recursive: true });
fs.mkdirSync(backendRoot, { recursive: true });
fs.mkdirSync(path.join(stageRoot, 'temp'), { recursive: true });
env.TEMP = path.join(stageRoot, 'temp');
env.TMP = env.TEMP;

runNpm(['run', 'build'], root);

fs.mkdirSync(path.join(appRoot, 'desktop'), { recursive: true });
fs.copyFileSync(path.join(root, 'desktop', 'main.cjs'), path.join(appRoot, 'desktop', 'main.cjs'));
fs.copyFileSync(path.join(root, 'desktop', 'main-win81.cjs'), path.join(appRoot, 'desktop', 'main-win81.cjs'));
fs.copyFileSync(path.join(root, 'desktop', 'seed.cjs'), path.join(appRoot, 'desktop', 'seed.cjs'));
copyFolder(path.join(root, 'backend', 'dist'), path.join(backendRoot, 'dist'));
copyFolder(path.join(root, 'backend', 'prisma'), path.join(backendRoot, 'prisma'), (source) => {
  const relative = path.relative(path.join(root, 'backend', 'prisma'), source);
  return !relative.split(path.sep).some((part) => part === 'data' || /\.db(?:-.+)?$/i.test(part));
});
copyFolder(path.join(root, 'frontend', 'dist'), path.join(appRoot, 'frontend', 'dist'));

const legacySchemaPath = path.join(backendRoot, 'prisma', 'schema.prisma');
const enumValues = new Set();
let legacySchema = fs.readFileSync(legacySchemaPath, 'utf8').replace(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}\s*/gm, (_block, _name, body) => {
  for (const line of body.split(/\r?\n/)) {
    const value = line.trim().match(/^([A-Za-z_]\w*)$/)?.[1];
    if (value) enumValues.add(value);
  }
  return '';
});
for (const value of enumValues) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  legacySchema = legacySchema.replace(new RegExp(`@default\\(\\s*${escaped}\\s*\\)`, 'g'), `@default("${value}")`);
}
legacySchema = legacySchema.replace(/\b(UserRole|BudgetType|ProcurementMode|VendorType|TaxStatus|TaxpayerStatus|TaxCertificateStatus|ChequeType|ShelfLifeItemCategory)\b/g, 'String');
legacySchema = legacySchema.replace(/\bJson\b/g, 'String');
fs.writeFileSync(legacySchemaPath, legacySchema);

const legacyAppPackage = {
  name: 'institute-accounts-system-win81',
  version: '1.0.0',
  private: true,
  main: 'desktop/main-win81.cjs',
  devDependencies: { electron: '22.3.27' },
};
fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify(legacyAppPackage, null, 2)}\n`);

const backendPackage = {
  name: 'institute-accounts-backend-win81',
  version: '1.0.0',
  private: true,
  dependencies: {
    '@prisma/client': '5.22.0',
    bcryptjs: '3.0.2',
    'cookie-parser': '1.4.7',
    cors: '2.8.5',
    'csv-parse': '5.6.0',
    dotenv: '16.4.7',
    exceljs: '4.4.0',
    express: '4.21.2',
    helmet: '7.2.0',
    jsonwebtoken: '9.0.2',
    'node-fetch': '2.7.0',
    pdfkit: '0.15.0',
    'puppeteer-core': '19.11.1',
    prisma: '5.22.0',
    zod: '4.1.5',
  },
};
fs.writeFileSync(path.join(backendRoot, 'package.json'), `${JSON.stringify(backendPackage, null, 2)}\n`);

runNpm(['install', '--prefix', backendRoot, '--no-audit', '--no-fund', '--omit=dev'], root);
runNpm(['install', '--prefix', appRoot, '--no-audit', '--no-fund'], root);

const prismaCli = path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');
run(process.execPath, [prismaCli, 'generate', '--schema', path.join(backendRoot, 'prisma', 'schema.prisma')], backendRoot);

const clientEntry = path.join(backendRoot, 'node_modules', '@prisma', 'client');
const legacyEnums = {
  UserRole: { ADMIN: 'ADMIN', ACCOUNTANT: 'ACCOUNTANT', FINANCE_MANAGER: 'FINANCE_MANAGER', USER: 'USER' },
  BudgetType: { Original: 'Original', Revised: 'Revised', Supplementary: 'Supplementary' },
};
const enumShim = `const client = require('.prisma/client/default');\nObject.assign(client, ${JSON.stringify(legacyEnums)});\nmodule.exports = client;\n`;
for (const file of ['index.js', 'default.js']) fs.writeFileSync(path.join(clientEntry, file), enumShim);

fs.mkdirSync(releaseRoot, { recursive: true });
const configPath = path.join(stageRoot, 'electron-builder.yml');
const yamlPath = (value) => value.replace(/\\/g, '/').replace(/'/g, "''");
const config = `appId: pk.edu.institute.accounts.win81\nproductName: Institute Accounts System\ncompression: normal\ndirectories:\n  output: '${yamlPath(releaseRoot)}'\n  buildResources: '${yamlPath(path.join(root, 'desktop'))}'\nfiles:\n  - desktop/main.cjs\n  - desktop/seed.cjs\n  - package.json\n  - backend/dist/**\n  - backend/prisma/**\n  - backend/node_modules/**\n  - frontend/dist/**\n  - '!backend/node_modules/.cache/**'\n  - '!backend/node_modules/**/test/**'\n  - '!backend/node_modules/**/tests/**'\n  - '!backend/node_modules/**/*.map'\n  - '!backend/prisma/data/**'\n  - '!backend/prisma/**/*.db'\n  - '!backend/prisma/**/*.db-*'\nasar: true\nasarUnpack:\n  - frontend/dist/**\n  - backend/node_modules/.prisma/client/query_engine-windows.dll.node\n  - backend/node_modules/@prisma/engines/schema-engine-windows.exe\n  - backend/node_modules/prisma/node_modules/@prisma/engines/schema-engine-windows.exe\nwin:\n  target:\n    - target: portable\n      arch:\n        - x64\n  artifactName: Institute-Accounts-System-Windows-8.1.${'${ext}'}\n  signAndEditExecutable: false\nelectronFuses:\n  runAsNode: true\n`;
fs.writeFileSync(configPath, config.replace('  - desktop/main.cjs\n', '  - desktop/main.cjs\n  - desktop/main-win81.cjs\n'));

run(process.execPath, [electronBuilder, '--win', 'portable', '--x64', '--config', configPath], appRoot);

const artifact = path.join(releaseRoot, 'Institute-Accounts-System-Windows-8.1.exe');
if (!fs.existsSync(artifact)) throw new Error(`Packaged legacy executable was not created: ${artifact}`);
const launcher = `@echo off\r\nsetlocal\r\nset "APP=%~dp0Institute Accounts System.exe"\r\nif not exist "%APP%" (\r\n  echo Application files are incomplete. Extract the whole ZIP first.\r\n  pause\r\n  exit /b 1\r\n)\r\nstart "" "%APP%"\r\nendlocal\r\n`;
fs.writeFileSync(path.join(releaseRoot, 'Open-Institute-Accounts-System-Windows-8.1.bat'), launcher);
const startGuide = [
  'INSTITUTE ACCOUNTS SYSTEM - WINDOWS 8.1 BUILD',
  '',
  'Extract the whole ZIP to a writable local folder on the Windows 8.1 64-bit PC.',
  'Keep all extracted files together. Start the app by double-clicking the .bat file.',
  'Leave at least 1 GB free on that drive. Do not launch it from inside a ZIP file.',
  'First login: username admin, password ChangeMe123! Change it after signing in.',
  '',
  'This compatibility build uses the last Electron line that supports Windows 8.1.',
  'Use only for this offline/local app; the older browser runtime no longer receives security fixes.',
  '',
  'If it fails, send the full error dialog and this log if present:',
  '%APPDATA%\\Institute Accounts System Desktop\\desktop-startup.log',
].join('\r\n') + '\r\n';
fs.writeFileSync(path.join(releaseRoot, 'START-HERE.txt'), startGuide);

const transferRoot = path.join(releaseRoot, 'For-Another-PC-Files');
const unpackedOutput = path.join(releaseRoot, 'win-unpacked');
if (!fs.existsSync(unpackedOutput)) throw new Error(`Unpacked Windows application is missing: ${unpackedOutput}`);
if (path.dirname(path.resolve(transferRoot)) !== path.resolve(releaseRoot) || path.basename(transferRoot) !== 'For-Another-PC-Files') {
  throw new Error(`Refusing to replace unexpected transfer directory: ${transferRoot}`);
}
fs.rmSync(transferRoot, { recursive: true, force: true });
fs.mkdirSync(transferRoot, { recursive: true });
copyFolder(unpackedOutput, transferRoot);
fs.copyFileSync(path.join(releaseRoot, 'Open-Institute-Accounts-System-Windows-8.1.bat'), path.join(transferRoot, 'Open-Institute-Accounts-System-Windows-8.1.bat'));
fs.copyFileSync(path.join(releaseRoot, 'START-HERE.txt'), path.join(transferRoot, 'START-HERE.txt'));

const archivePath = path.join(releaseRoot, 'Institute-Accounts-System-Windows-8.1-Files.zip');
const archiveScriptPath = path.join(stageRoot, 'create-transfer-zip.ps1');
fs.writeFileSync(archiveScriptPath, [
  'param([Parameter(Mandatory=$true)][string]$SourcePath, [Parameter(Mandatory=$true)][string]$DestinationPath)',
  '$ErrorActionPreference = \'Stop\'',
  'Compress-Archive -Path (Join-Path $SourcePath \'*\') -DestinationPath $DestinationPath -CompressionLevel Fastest -Force',
].join('\r\n') + '\r\n');
const powershellExe = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
run(powershellExe, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', archiveScriptPath, transferRoot, archivePath], root);

if (fs.existsSync(unpackedOutput)) {
  const resolvedOutput = path.resolve(unpackedOutput);
  if (path.dirname(resolvedOutput) !== path.resolve(releaseRoot) || path.basename(resolvedOutput) !== 'win-unpacked') {
    throw new Error(`Refusing to remove unexpected unpacked build output: ${resolvedOutput}`);
  }
  fs.rmSync(resolvedOutput, { recursive: true, force: true });
}

console.log(`Windows 8.1 package ready: ${releaseRoot}`);
