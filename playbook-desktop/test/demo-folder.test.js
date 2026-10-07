import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DemoFolder, faceitMatchId } from '../src/demo-folder.js';

const content = Buffer.from('PBDEMS2\0example demo data for the folder import');
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'playbook-demos-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'downloads');
  await mkdir(folder);
  let uploads = 0, creates = 0, ownerId = '76561198000000001';
  const entries = new Map(), pending = new Map(), calls = [];
  const request = async (url, init = {}) => {
    calls.push(url);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    if (url === '/api/auth/me') return { user: { identitySteam64: ownerId } };
    if (url === '/api/analysis/demos/lookup') return { demo: entries.get(`${ownerId}:${body.teamId}:${body.hash}`) || null };
    if (url === '/api/analysis/demos') {
      if (options.block) throw Object.assign(new Error('Warte auf einen freien Importplatz.'), { status: 429 });
      const demo = { id: `demo-${++creates}`, ...body };
      pending.set(demo.id, demo);
      return { demo };
    }
    if (url.endsWith('/file')) {
      const demo = pending.get(url.split('/').at(-2));
      const uploaded = Buffer.from(await body.arrayBuffer());
      const hash = createHash('sha256').update(uploaded).digest('hex');
      demo.status = 'queued';
      entries.set(`${ownerId}:${demo.teamId}:${hash}`, demo);
      uploads++;
      if (options.lostResponse) throw new Error('Antwort verloren.');
      return { demo };
    }
    if (url === '/api/analysis/matches/faceit') return { ids: options.series ? ['map-1', 'map-2'] : ['match-1'] };
    if (url.endsWith('/demo')) return { ok: true };
    throw new Error(`Unexpected request: ${url}`);
  };
  const importer = new DemoFolder({ directory: path.join(root, 'settings'), request,
    extract: async (_file, directory) => {
      if (options.archiveError) throw new Error('Archiv ist beschädigt.');
      const file = path.join(directory, '0.dem');
      await writeFile(file, content);
      return [{ name: 'archived.dem', path: file }];
    },
  });
  await importer.initialize();
  await importer.setFolder(folder);
  return { importer, folder, root, request, calls, stats: () => ({ uploads, creates }), setOwner: value => { ownerId = value; } };
}
test('saved folder survives restart and repeated scans skip unchanged and renamed files by content', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.folder, 'first.dem'), content);
  await writeFile(path.join(f.folder, 'copy.dem'), content);
  await writeFile(path.join(f.folder, 'notes.txt'), content);
  await mkdir(path.join(f.folder, 'nested'));
  await writeFile(path.join(f.folder, 'nested', 'hidden.dem'), content);
  assert.deepEqual((await f.importer.run()).results.map(result => result.status), ['uploaded', 'skipped']);
  assert.equal(f.stats().uploads, 1);
  const restarted = new DemoFolder({ directory: path.join(f.root, 'settings'), request: f.request });
  await restarted.initialize();
  assert.equal(restarted.folder, f.folder);
  assert.ok((await restarted.run()).results.every(result => result.status === 'skipped'));
  assert.equal(f.stats().uploads, 1);
  assert.deepEqual(await readFile(path.join(f.folder, 'first.dem')), content);
});
test('deduplication respects the selected team scope', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.folder, 'first.dem.gz'), content);
  await f.importer.run();
  await f.importer.run({ teamId: 'team-1' });
  assert.equal(f.stats().uploads, 2);
  assert.equal((await f.importer.run({ teamId: 'team-1' })).results[0].status, 'skipped');
});
test('archives upload only extracted demos, retain originals and remove temporary files', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.folder, 'archive.zip'), content);
  assert.equal((await f.importer.run()).results[0].status, 'uploaded');
  assert.equal((await f.importer.run()).results[0].status, 'skipped');
  assert.deepEqual(await readdir(path.join(f.root, 'settings', 'extracted')), []);
  assert.deepEqual(await readFile(path.join(f.folder, 'archive.zip')), content);
});
test('a damaged archive does not prevent the remaining files from being imported', async t => {
  const f = await fixture(t, { archiveError: true });
  await writeFile(path.join(f.folder, 'bad.rar'), content);
  await writeFile(path.join(f.folder, 'good.dem'), content);
  assert.deepEqual((await f.importer.run()).results.map(result => result.status), ['failed', 'uploaded']);
});
test('a lost successful upload response is reconciled without reuploading or deleting the demo', async t => {
  const f = await fixture(t, { lostResponse: true });
  await writeFile(path.join(f.folder, 'first.dem'), content);
  assert.equal((await f.importer.run()).results[0].status, 'uploaded');
  assert.equal((await f.importer.run()).results[0].status, 'skipped');
  assert.equal(f.stats().creates, 1);
});
test('a waiting bulk import can be cancelled and concurrent scans are rejected', async t => {
  const f = await fixture(t, { block: true });
  await writeFile(path.join(f.folder, 'first.dem'), content);
  const run = f.importer.run();
  await assert.rejects(f.importer.run(), /läuft bereits/);
  await assert.rejects(f.importer.setFolder(f.folder), /beendet/);
  setTimeout(() => f.importer.cancel(), 30);
  await run;
  assert.equal(f.importer.state().running, false);
  assert.equal(f.stats().uploads, 0);
});
test('FACEIT filenames link single-map matches and leave series unassigned', async t => {
  for (const series of [false, true]) {
    const f = await fixture(t, { series });
    await writeFile(path.join(f.folder, '1-cb038819-b0d0-4471-b25c-0e7468ab1eb1-1-1.dem.gz'), content);
    const result = await f.importer.run();
    assert.equal(f.calls.includes('/api/analysis/matches/match-1/demo'), !series);
    assert.match(result.results[0].message, series ? /Mehrere Maps/ : /zugeordnet/);
  }
  assert.equal(faceitMatchId('1-cb038819-b0d0-4471-b25c-0e7468ab1eb1-1-1.dem.gz'), '1-cb038819-b0d0-4471-b25c-0e7468ab1eb1');
});
test('switching accounts stops the scan before files are uploaded for another user', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.folder, 'first.dem'), content);
  let checks = 0;
  f.importer.request = async (url, options) => {
    if (url === '/api/auth/me' && ++checks === 2) f.setOwner('76561198000000002');
    return f.request(url, options);
  };
  const result = await f.importer.run();
  assert.equal(f.stats().uploads, 0);
  assert.match(result.results[0].message, /Konto hat sich geändert/);
});
