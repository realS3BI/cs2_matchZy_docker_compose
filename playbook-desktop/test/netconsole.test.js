import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { NetConsole } from '../src/netconsole.js';

test('normal CS2 netconsole reads and restores values over the text protocol', async t => {
  const state = { crosshair: 'true', cl_crosshair_gap: '-2.5', r_drawviewmodel: 'true' };
  const commands = [];
  const server = net.createServer(socket => {
    let pending = '';
    socket.on('data', bytes => {
      // The regular netconsole accepts text lines, not binary NetConsole packets.
      if (bytes.includes(0)) { socket.destroy(); return; }
      pending += bytes.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const command = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
        commands.push(command);
        const [name, value] = command.split(' ');
        let reply;
        if (name === 'echo') reply = `[Console] ${value}\r\n`;
        else if (value === undefined) reply = `[Console] "${name}" = "${state[name]}"\r\n`;
        else if (name !== 'r_drawviewmodel') state[name] = value;
        if (reply) {
          const bytes = Buffer.from(reply);
          socket.write(bytes.subarray(0, 7)); socket.write(bytes.subarray(7));
        }
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const console = new NetConsole({ port: server.address().port });
  t.after(() => { console.close(); server.close(); });
  assert.deepEqual(await console.read(['crosshair', 'cl_crosshair_gap']), { crosshair: 'true', cl_crosshair_gap: '-2.5' });
  await Promise.all([console.write({ crosshair: 'false' }), console.read(['cl_crosshair_gap'])]);
  assert.equal(state.crosshair, 'false');
  await console.write({ crosshair: 'true' });
  assert.equal(state.crosshair, 'true');
  await assert.rejects(console.write({ r_drawviewmodel: 'false' }), /erlaubt r_drawviewmodel/);
  assert.ok(commands.every(command => !command.includes('CMND')));
});
