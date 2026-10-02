import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NetConsole } from '../src/netconsole.js';
import { Presentation, NAMES, profile } from '../src/presentation.js';

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
  await assert.rejects(console.write({ r_drawviewmodel: 'false' }), { code: 'ECVARMISMATCH' });
  assert.ok(commands.every(command => !command.includes('CMND')));
});

test('CS2 pixel scaling at 1440p rejects a fixed 1080 profile; captures use the game height and restore originals', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'playbook-crosshair-'));
  const events = [], commands = [];
  let height = 1440, state, denied = false;
  const sizes = ['cl_crosshair_length', 'cl_crosshair_thickness', 'cl_crosshair_gap'];
  const server = net.createServer(socket => {
    let pending = '';
    socket.on('data', bytes => {
      pending += bytes.toString();
      while (pending.includes('\n')) {
        const at = pending.indexOf('\n'), command = pending.slice(0, at).trim();
        pending = pending.slice(at + 1);
        if (!command) continue;
        commands.push(command);
        const [name, value] = command.split(' ');
        // Model the engine's authoring-height update and subsequent pixel scaling.
        if (name === 'echo') {
          const scale = height / Number(state.cl_crosshair_screen_height);
          for (const size of sizes) state[size] = String(Math.round(Number(state[size]) * scale));
          state.cl_crosshair_screen_height = String(height);
          socket.write(`[Console] ${value}\n`);
        } else if (value === undefined) socket.write(`[Console] ${name} = ${state[name]}\n`);
        else if (!(denied && name === 'cl_crosshaircolor_r' && value === '255')) {
          state[name] = value;
          if (sizes.includes(name)) state.cl_crosshair_screen_height = String(height);
        }
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connection = new NetConsole({ port: server.address().port, log: (...event) => events.push(event) });
  const presentation = new Presentation(connection, path.join(directory, 'recovery.json'), async () => ({
    identity: 'game:1440', client: { top: 132, bottom: 132 + height },
  }));
  t.after(async () => {
    clearTimeout(presentation.timer); connection.close(); server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const original = screenHeight => ({ ...profile('video', screenHeight),
    cl_crosshairstyle: '7', cl_crosshair_length: '10', cl_crosshair_thickness: '2', cl_crosshair_gap: '5',
    cl_crosshaircolor_r: '19', cl_crosshaircolor_g: '213', cl_crosshaircolor_b: '167',
    cl_crosshair_drawoutline: '1', cl_crosshairdot: 'true', cl_crosshair_recoil: 'true', cl_showfps: '1',
  });
  state = original(height);
  await assert.rejects(connection.write(profile('aim')), { code: 'ECVARMISMATCH' });
  assert.equal(state.cl_crosshair_length, '29');
  assert.ok(events.some(([name, details]) => name === 'values.mismatched' && details.names.includes('cl_crosshair_length')));
  assert.ok(events.filter(([name]) => name === 'values.mismatched').every(([, details]) => Object.keys(details).join(',') === 'names'));
  assert.doesNotMatch(JSON.stringify(events), /crosshair_length =|"(?:expected|actual|values)":/);

  for (height of [720, 1080, 1440, 2160]) {
    const before = original(height); state = { ...before };
    for (const slot of ['aim', 'position', 'front', 'effect', 'video']) {
      const token = await presentation.begin(slot);
      assert.deepEqual(await connection.read(NAMES), profile(slot, height));
      await presentation.end(token);
      assert.deepEqual(await connection.read(NAMES), before);
      assert.equal(await presentation.saved(), undefined);
    }
  }
  denied = true;
  await assert.rejects(presentation.begin('aim'), { code: 'ECVARMISMATCH' });
  assert.deepEqual(state, original(height));
  assert.equal(await presentation.saved(), undefined);

  // Legacy journals can put the reference height before the dimension fields.
  await connection.write({ cl_crosshair_screen_height: String(height), cl_crosshair_length: '7' });
  const writes = commands.filter(command => command.includes(' ') && !command.startsWith('echo'));
  assert.deepEqual(writes.slice(-2), ['cl_crosshair_length 7', `cl_crosshair_screen_height ${height}`]);
});
