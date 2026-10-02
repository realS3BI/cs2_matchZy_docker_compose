import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

test('the real Electron entry opens a visible window instead of waiting forever for ready', { timeout: 25_000 }, async () => {
  // Keep the actual ESM entry: importing it from a CJS wrapper would hide the
  // loader deadlock. Only replace network navigation with a local test page.
  const directory = await mkdtemp(path.join(root, '.startup-test-'));
  try {
    await cp(path.join(root, 'src'), path.join(directory, 'src'), { recursive: true });
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'playbook-startup-test', version: pkg.version, type: pkg.type, main: pkg.main }));
    await writeFile(path.join(directory, 'startup.html'), '<!doctype html><title>Playbook Startprüfung</title><p>Fenster gestartet</p>');
    await writeFile(path.join(directory, 'observer.cjs'), `
      const { app, BrowserWindow, dialog } = require('electron');
      const path = require('node:path');
      app.setPath('userData', path.join(__dirname, 'user-data'));
      BrowserWindow.prototype.loadURL = function () { return this.loadFile(path.join(__dirname, 'startup.html')); };
      dialog.showErrorBox = (title, message) => { console.error(title + ': ' + message); app.exit(1); };
      let finished = false;
      function report() {
        if (finished) return;
        finished = true;
        const windows = BrowserWindow.getAllWindows();
        const result = { ready: app.isReady(), windows: windows.length, visible: windows.some(window => window.isVisible()) };
        console.log('STARTUP_RESULT ' + JSON.stringify(result));
        app.exit(result.ready && result.visible ? 0 : 1);
      }
      app.on('browser-window-created', (_event, window) => window.webContents.once('did-finish-load', () => setTimeout(report, 100)));
      setTimeout(report, 8000);
    `);
    const entry = path.join(directory, pkg.main);
    await writeFile(entry, "import '../observer.cjs';\n" + await readFile(entry, 'utf8'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [directory, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = data => { output = (output + data.toString()).slice(-32_768); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const deadline = setTimeout(() => child.kill('SIGKILL'), 15_000);
    let code;
    try { code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); }
    finally { clearTimeout(deadline); }
    assert.equal(code, 0, `Electron ist ohne sichtbares Fenster hängen geblieben:\n${output}`);
    const result = JSON.parse(output.match(/STARTUP_RESULT (\{[^\n]+\})/)?.[1] || '{}');
    assert.deepEqual(result, { ready: true, windows: 1, visible: true });
    const log = await readFile(path.join(directory, 'user-data/logs/startup.log'), 'utf8');
    assert.match(log, /Electron ist startbereit/);
    assert.match(log, /Playbook-Fenster erstellt/);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
