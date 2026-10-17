import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const run = (script, args = []) => spawn(process.execPath, [script, ...args], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
const compiler = run(fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), ['-p', 'tsconfig.electron.json']);
await new Promise((resolve, reject) => compiler.on('exit', code => code === 0 ? resolve() : reject(new Error('Electron compile failed'))));
const vite = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] });
// Trust readiness from our own child, never an unrelated server already on port 5173.
await new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => { vite.kill(); reject(new Error('Vite did not start')); }, 15000);
  vite.stdout.on('data', chunk => { process.stdout.write(chunk); output = (output + chunk).slice(-4000); if (/Local:.*127\.0\.0\.1:5173/.test(output)) { clearTimeout(timer); resolve(); } });
  vite.stderr.on('data', chunk => process.stderr.write(chunk));
  vite.once('error', error => { clearTimeout(timer); reject(error); });
  vite.once('exit', code => { clearTimeout(timer); reject(new Error('Vite exited before startup: ' + code)); });
});
const desktopEnv = { ...process.env, TEAMROOM_DEV_URL: 'http://127.0.0.1:5173' };
delete desktopEnv.ELECTRON_RUN_AS_NODE;
const desktop = spawn(require('electron'), ['.'], { stdio: 'inherit', env: desktopEnv });
const stop = () => { desktop.kill(); vite.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
desktop.on('exit', code => { vite.kill(); process.exit(code || 0); });
