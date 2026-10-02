import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchDiagnosis, collectCS2Diagnostics, diagnosticReport } from '../src/cs2-diagnostics.js';

const game = overrides => ({
  running: true, readable: true, vconsole: false, port: 2121, processCount: 1, processId: 42, uptimeSeconds: 120, hasWindow: true,
  console: true, tools: false, insecure: false, commandPipe: false, playbookPipeId: null, netconPassword: false, ports: [2121], expectedPort: 2121, listenersReadable: true, listenerError: null, listeners: [], ...overrides,
});
test('diagnosis separates removed netconsole, port ownership, failed inspection and review pipes', () => {
  assert.match(launchDiagnosis(game()), /keinen TCP-Listener.*Netconsole nicht mehr/);
  assert.match(launchDiagnosis(game({ listenersReadable: false })), /nicht verfügbar/);
  assert.match(launchDiagnosis(game({ listeners: [{ address: '127.0.0.1', port: 2121, cs2: false }] })), /anderen Prozess/);
  assert.match(launchDiagnosis(game({ commandPipe: true })), /ohne -insecure/);
  assert.match(launchDiagnosis(game({ commandPipe: true, insecure: true })), /nicht zu Playbook/);
  assert.match(launchDiagnosis(game({ commandPipe: true, insecure: true, playbookPipeId: 'a'.repeat(32) })), /noch keinen lokalen Antwortkanal/);
  assert.match(launchDiagnosis(game({ commandPipe: true, insecure: true, playbookPipeId: 'a'.repeat(32), listeners: [{ address: '0.0.0.0', port: 29000, cs2: true }] })), /Antwortkanal auf Port 29000/);
});
test('copyable report retains the original error, protocol state and sanitized Windows facts', async () => {
  const diagnosis = await collectCS2Diagnostics({ run: async () => ({ stdout: JSON.stringify({ ...game(), CommandLine: '+password secret', otherPrivateField: 'do-not-log' }) }) });
  assert.equal(diagnosis.info.CommandLine, undefined);
  const report = diagnosticReport(diagnosis, { appVersion: '0.1.5', operation: 'connect', error: Object.assign(new Error('CS2 nimmt keine Verbindung an.'), { code: 'ECONNREFUSED' }), transport: { prepared: true, commandConnected: false, outputConnected: false, responseConnected: false } });
  assert.match(report, /ECONNREFUSED/);
  assert.match(report, /Ursprünglicher Fehler: CS2 nimmt/);
  assert.match(report, /Command-Pipe bereit: true/);
  assert.match(report, /Laufzeit: 120 s/);
  assert.doesNotMatch(report + JSON.stringify(diagnosis), /secret|do-not-log|CommandLine/);
});
test('PowerShell failures and invalid output stay explicit without leaking stdout or stderr', async () => {
  const failure = await collectCS2Diagnostics({ run: async () => { throw Object.assign(new Error('password secret'), { killed: true, stderr: 'private' }); } });
  assert.match(failure.summary, /ETIMEDOUT/);
  const invalid = await collectCS2Diagnostics({ run: async () => ({ stdout: '{"secret": "private"}' }) });
  assert.match(invalid.summary, /EINVALIDDIAGNOSIS/);
  assert.doesNotMatch(JSON.stringify([failure, invalid]), /private|secret/);
});
