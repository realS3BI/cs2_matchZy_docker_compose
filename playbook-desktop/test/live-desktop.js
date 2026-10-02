// Opt-in test of the actual Electron entry, renderer bridge, game image and F8.
import { mkdtemp, cp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectCS2Diagnostics } from '../src/cs2-diagnostics.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
if ((await collectCS2Diagnostics()).info?.running) throw new Error('CS2 vor dem Live-Test regulär schließen.');
const directory = await mkdtemp(path.join(root, '.startup-test-live-'));
let success = false;
try {
  await cp(path.join(root, 'src'), path.join(directory, 'src'), { recursive: true });
  await cp(path.join(root, 'native/bin/publish/Playbook.Windows.exe'), path.join(directory, 'native/bin/publish/Playbook.Windows.exe'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'playbook-live-test', version: pkg.version, type: pkg.type, main: pkg.main }));
  await cp(path.join(root, 'test/live-desktop-observer.cjs'), path.join(directory, 'observer.cjs'));
  const entry = path.join(directory, pkg.main);
  await writeFile(entry, "import '../observer.cjs';\n" + await readFile(entry, 'utf8') + '\nexport { consoleConnection };\n');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [directory], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const collect = data => { const text = data.toString(); output = (output + text).slice(-32_768); process.stdout.write(text); };
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  const deadline = setTimeout(() => child.kill(), 100_000);
  try { await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); }
  finally { clearTimeout(deadline); }
  const log = await readFile(path.join(directory, 'user-data/logs/startup.log'), 'utf8');
  if (!output.includes('LIVE_DESKTOP_RESULT passed')) throw new Error('Der Desktop-Live-Test ist fehlgeschlagen.');
  if (log.includes('protocol.invalid')) throw new Error('Der Antwortkanal war beim Mapwechsel nicht stabil.');
  await cp(path.join(directory, 'user-data/logs/startup.log'), path.join(root, 'dist/live-desktop.log'));
  success = true;
} finally {
  const pending = await stat(path.join(directory, 'user-data/review-recovery.json')).catch(() => undefined);
  if (success && !pending) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  else console.log('Diagnose und gegebenenfalls Wiederherstellung bleiben erhalten: ' + directory);
}
