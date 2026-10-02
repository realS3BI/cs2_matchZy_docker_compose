import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { CommandPipe, VConsoleReader } from '../src/command-pipe.js';

function packet(type, body, version = 0xd4) {
  const bytes = Buffer.alloc(12 + body.length);
  bytes.write(type);
  bytes.writeUInt16BE(version, 4);
  if (version !== 0xd4) bytes.writeUInt32BE(bytes.length, 6);
  else bytes.writeUInt16BE(bytes.length, 8);
  body.copy(bytes, 12);
  return bytes;
}
const print = text => packet('PRNT', Buffer.concat([Buffer.alloc(28), Buffer.from(text + '\n\0')]));

test('VConsole skips fragmented 32-bit CVRB dumps and preserves following UTF-8 replies', () => {
  const bytes = Buffer.concat([packet('AINF', Buffer.alloc(40)), packet('CVRB', Buffer.alloc(477_777), 2), packet('EFUL', Buffer.alloc(0), 5), print('grün'), print('crosshair = true'), packet('PRNT', Buffer.alloc(28))]);
  const reader = new VConsoleReader(), lines = [];
  for (let offset = 0; offset < bytes.length; offset += 7919) lines.push(...reader.push(bytes.subarray(offset, offset + 7919)));
  assert.deepEqual(lines, ['grün', 'crosshair = true']);
  assert.equal(reader.buffer.length, 0);
  assert.throws(() => new VConsoleReader().push(packet('PRNT', Buffer.alloc(3))), /Unvollständige/);
  const invalid = packet('CVRB', Buffer.alloc(0), 2);
  invalid.writeUInt32BE(16_000_001, 6);
  assert.throws(() => new VConsoleReader().push(invalid), /Paketgröße/);
});

test('Windows command pipe reads through VConsole, restores values and keeps logs private', { skip: process.platform !== 'win32' }, async t => {
  const events = [], state = { crosshair: 'true', cl_crosshair_gap: '-2.5431' };
  let replySocket, inspections = 0;
  const server = net.createServer(socket => {
    replySocket = socket;
    socket.on('error', () => {});
    socket.write(packet('CVRB', Buffer.alloc(90_000), 2));
    socket.on('data', () => assert.fail('Commands must be sent through the named pipe'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let ready;
  const attached = new Promise(resolve => { ready = resolve; });
  const connection = new CommandPipe({ port: server.address().port, inspect: async () => { inspections++; }, log: (...event) => {
    events.push(event);
    if (events.filter(([name]) => name === 'pipe.connected').length === 2) ready();
  } });
  const id = await connection.prepare();
  const command = net.createConnection({ path: `\\\\.\\pipe\\playbook_${id}_cmd` });
  const output = net.createConnection({ path: `\\\\.\\pipe\\playbook_${id}_out` });
  command.on('error', () => {}); output.on('error', () => {});
  t.after(() => { command.destroy(); output.destroy(); replySocket?.destroy(); connection.shutdown(); server.close(); });
  await Promise.all([once(command, 'connect'), once(output, 'connect')]);
  await attached;
  let buffer = '';
  command.on('data', bytes => {
    buffer += bytes.toString();
    while (buffer.includes('\n')) {
      const at = buffer.indexOf('\n'), line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      const [name, value] = line.split(' ');
      if (name === 'echo') replySocket.write(print(value));
      else if (value === undefined) replySocket.write(print(`${name} = ${state[name]}`));
      else state[name] = value;
    }
  });
  assert.deepEqual(await connection.read(['crosshair', 'cl_crosshair_gap']), state);
  await connection.write({ crosshair: 'false' });
  await connection.write({ crosshair: 'true' });
  assert.equal(state.crosshair, 'true');
  assert.equal(inspections, 1);
  assert.equal(connection.state().commandConnected, true);
  const log = JSON.stringify(events);
  assert.match(log, /command.confirmed/);
  assert.doesNotMatch(log, /-2\.5431|crosshair =/);
});
