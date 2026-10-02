import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NetConsole } from '../src/netconsole.js';
import { startupLog } from '../src/startup-log.js';

test('protocol timeout logs marker progress without copying raw console text', async t => {
  const events = [];
  let client;
  const server = net.createServer(socket => {
    client = socket;
    socket.on('error', () => {});
    socket.on('data', bytes => {
      const start = bytes.toString().split('\n')[0].slice(5);
      socket.write(start + '\nprivate password secret\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connection = new NetConsole({ port: server.address().port, replyTimeoutMs: 40, log: (...event) => events.push(event) });
  t.after(() => { connection.close(); client?.destroy(); server.close(); });
  await assert.rejects(connection.read(['crosshair']), { code: 'EREPLYTIMEOUT' });
  const failure = events.find(([name]) => name === 'command.failed')[1];
  assert.equal(failure.startMarker, true);
  assert.equal(failure.endMarker, false);
  assert.equal(failure.receivedLines, 2);
  assert.doesNotMatch(JSON.stringify(events), /private|password|secret/);
});
test('startup log writes readable UTF-8 events and prevents multiline log injection', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'playbook-log-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logger = startupLog({ getPath: () => directory, getVersion: () => '0.1.5' });
  logger.event('CS2', 'tcp.error', { code: 'ECONNREFUSED', elapsedMs: 4 }, 'ERROR');
  logger.event('Diagnose', 'flags', { netconPassword: false, password: 'other-secret', ports: [] });
  logger.write('Prüfung fehlgeschlagen\nGefälschte Zeile +password secret -netconpassword hidden');
  const content = await readFile(logger.file, 'utf8');
  assert.match(content, /\[ERROR\] \[CS2\] tcp.error/);
  assert.match(content, /ECONNREFUSED/);
  assert.match(content, /Prüfung/);
  assert.equal(content.trim().split('\n').length, 4);
  assert.match(content, /"netconPassword":false,"password":"\[ENTFERNT\]","ports":\[\]/);
  assert.doesNotMatch(content, /secret|hidden/);
});
