// Explicit Windows integration test, never run by npm test. Close CS2 first.
// --offline also loads a local map and verifies all five recording profiles.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { CommandPipe } from '../src/command-pipe.js';
import { collectCS2Diagnostics, diagnosticReport } from '../src/cs2-diagnostics.js';
import { launchAndWait } from '../src/launch.js';
import { Presentation, NAMES } from '../src/presentation.js';
import { startupLog } from '../src/startup-log.js';

const run = promisify(execFile);
const helper = fileURLToPath(new URL('../native/bin/publish/Playbook.Windows.exe', import.meta.url));
const userData = path.join(process.env.APPDATA, 'Playbook');
const logger = startupLog({ getPath: () => userData, getVersion: () => 'live-cs2-test' });
const log = (name, details, level) => {
  logger.event('Live-Test', name, details, level);
  if (!name.startsWith('command.')) console.log(name, JSON.stringify(details || {}));
};
const consoleConnection = new CommandPipe({ log, inspect: async id => {
  const { info } = await collectCS2Diagnostics();
  assert.equal(info?.playbookPipeId, id, 'CS2 must use the prepared Playbook pipe');
  assert.equal(info.insecure, true, 'The pipe requires -insecure');
  assert.ok(info.listeners.some(listener => listener.cs2 && listener.port === 29000), 'CS2 must own the reply port');
} });
const game = async () => JSON.parse((await run(helper, [], { windowsHide: true, timeout: 5000 })).stdout);
const presentation = new Presentation(consoleConnection, path.join(userData, 'review-recovery.json'), game);
let launched = false, restored = false;
try {
  if ((await collectCS2Diagnostics()).info?.running) throw new Error('CS2 läuft bereits. Das Spiel vor dem Live-Test regulär schließen.');
  await launchAndWait(async () => {
    const id = await consoleConnection.prepare();
    await run(helper, ['launch', id], { windowsHide: true, timeout: 5000 });
    launched = true;
  }, consoleConnection, { log });
  await presentation.recover();
  const original = await consoleConnection.read(NAMES);
  log('all-values.confirmed', { count: Object.keys(original).length });
  if (process.argv.includes('--offline')) {
    // This test owns the game it just launched and creates only a local server.
    await consoleConnection.execute(['map de_mirage']).catch(error => log('map.loading', { code: error.code }));
    await delay(15_000);
    await consoleConnection.execute(['sv_cheats 1', 'bot_kick']);
    for (const slot of ['aim', 'position', 'front', 'effect', 'video']) {
      const before = await consoleConnection.read(NAMES);
      const token = await presentation.begin(slot);
      await presentation.end(token);
      const after = await consoleConnection.read(NAMES);
      assert.deepEqual(after, before, `Exact restoration after ${slot}`);
      log('profile.restored', { slot, count: NAMES.length });
    }
  }
  await presentation.recover();
  assert.equal(await presentation.saved(), undefined);
  restored = true;
  console.log(diagnosticReport(await collectCS2Diagnostics(), { appVersion: 'live-test', operation: 'live', protocolConfirmed: true, transport: consoleConnection.state() }));
  log('live.passed');
} catch (error) {
  log('live.failed', { code: error.code, error: error.message }, 'ERROR');
  process.exitCode = 1;
} finally {
  clearTimeout(presentation.timer);
  try { await presentation.recover(); restored = true; }
  catch (error) { log('recovery.pending', { error: error.message }, 'ERROR'); restored = false; process.exitCode = 1; }
  if (launched && restored) {
    await consoleConnection.execute(['quit']).catch(() => {});
    await delay(1000);
  }
  consoleConnection.shutdown();
}
