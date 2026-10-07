import { createHash } from 'node:crypto';
import { createReadStream, openAsBlob } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const LIMIT = 1024 ** 3;
const demoFile = name => /\.dem(?:\.gz|\.bz2)?$/i.test(name);
const archiveFile = name => /\.(zip|rar|7z)$/i.test(name);
export const faceitMatchId = name => name.match(/(?:^|[^a-f0-9])(1-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?=[^a-f0-9]|$)/i)?.[1]?.toLowerCase();

async function fingerprint(file, signal) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file, { signal })) digest.update(chunk);
  return digest.digest('hex');
}

export class DemoFolder {
  constructor({ directory, request, extract }) {
    this.directory = directory;
    this.request = request;
    this.extract = extract;
    this.folder = '';
    this.running = false;
    this.current = '';
    this.results = [];
    this.completed = false;
  }
  state() {
    return { folder: this.folder, running: this.running, current: this.current, results: this.results, completed: this.completed, error: this.error || '' };
  }
  cancel() { this.controller?.abort(); return this.state(); }
  async send(url, options = {}) {
    for (;;) {
      this.controller.signal.throwIfAborted();
      const { user } = await this.request('/api/auth/me', { signal: this.controller.signal });
      if (user.identitySteam64 !== this.ownerId)
        throw Object.assign(new Error('Das angemeldete Konto hat sich geändert. Starte den Import erneut.'), { status: 401 });
      try { return await this.request(url, { ...options, signal: this.controller.signal }); }
      catch (error) {
        if (error.status !== 429) throw error;
        const current = this.current;
        this.current = `${current} · Warte auf einen freien Importplatz …`;
        try { await delay(15_000, undefined, { signal: this.controller.signal }); }
        finally { this.current = current; }
      }
    }
  }
  async initialize() {
    try {
      const { folder } = JSON.parse(await readFile(path.join(this.directory, 'folder.json'), 'utf8'));
      if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Ungültiger Ordnerpfad.');
      this.folder = folder;
    } catch (error) { if (error.code !== 'ENOENT') this.error = 'Der gespeicherte Demo-Ordner konnte nicht gelesen werden. Wähle ihn erneut aus.'; }
    // Only disposable extraction files are removed. Original files remain in the selected folder.
    await rm(path.join(this.directory, 'extracted'), { recursive: true, force: true });
  }
  async setFolder(folder) {
    if (this.running) throw new Error('Warte, bis der Ordnerimport beendet ist.');
    if (typeof folder !== 'string' || !folder || folder.length > 4096 || !path.isAbsolute(folder))
      throw new Error('Gib einen vollständigen Ordnerpfad ein.');
    const info = await stat(folder).catch(() => { throw new Error('Dieser Ordner wurde nicht gefunden.'); });
    if (!info.isDirectory()) throw new Error('Wähle einen Ordner aus.');
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, 'folder.tmp'), JSON.stringify({ folder }));
    await rename(path.join(this.directory, 'folder.tmp'), path.join(this.directory, 'folder.json'));
    this.folder = folder;
    this.error = '';
    this.results = [];
    this.completed = false;
    return this.state();
  }
  async run({ teamId = null, source = 'faceit' } = {}) {
    if (this.running) throw new Error('Ein Ordnerimport läuft bereits.');
    if (!this.folder) throw new Error('Wähle zuerst deinen Demo-Ordner aus.');
    if (teamId !== null && (typeof teamId !== 'string' || !/^[\w-]{1,100}$/.test(teamId))) throw new Error('Ungültiger Arbeitsbereich.');
    if (!['faceit', 'premier', 'other'].includes(source)) throw new Error('Wähle die Herkunft der Demos.');
    this.running = true;
    this.completed = false;
    this.controller = new AbortController();
    this.results = [];
    try {
      const { user } = await this.request('/api/auth/me');
      if (user.authKind === 'test') throw new Error('Melde dich mit Steam an, um Demos zu importieren.');
      const ownerId = user.identitySteam64;
      this.ownerId = ownerId;
      const files = (await readdir(this.folder, { withFileTypes: true }))
        .filter(entry => entry.isFile() && (demoFile(entry.name) || archiveFile(entry.name)))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of files) {
        if (this.controller.signal.aborted) break;
        const file = path.join(this.folder, entry.name);
        this.current = entry.name;
        let temporary;
        try {
          if (archiveFile(entry.name)) {
            if ((await stat(file)).size > LIMIT) throw new Error('Das Archiv darf höchstens 1 GiB groß sein.');
            const base = path.join(this.directory, 'extracted');
            await mkdir(base, { recursive: true });
            temporary = await mkdtemp(path.join(base, 'archive-'));
            const demos = await this.extract(file, temporary, this.controller.signal);
            if (!demos.length) throw new Error('Das Archiv enthält keine unterstützten Demo-Dateien.');
            for (const demo of demos) {
              if (!demoFile(demo.name) || path.dirname(demo.path) !== temporary) throw new Error('Das Archiv lieferte einen ungültigen Demo-Pfad.');
              try { await this.importOne(demo.path, demo.name, entry.name, ownerId, teamId, source, demos.length === 1 ? entry.name : ''); }
              catch (error) {
                if (this.controller.signal.aborted || [401, 403].includes(error.status)) throw error;
                this.results.push({ name: `${entry.name} → ${demo.name}`, status: 'failed', message: error.message });
              }
            }
          } else await this.importOne(file, entry.name, entry.name, ownerId, teamId, source);
        } catch (error) {
          this.results.push({ name: entry.name, status: 'failed', message: this.controller.signal.aborted ? 'Import abgebrochen. Beim nächsten Import wird diese Datei erneut geprüft.' : error.message });
          if (this.controller.signal.aborted || [401, 403].includes(error.status)) break;
        } finally {
          if (temporary) await rm(temporary, { recursive: true, force: true });
        }
      }
    } finally {
      this.running = false;
      this.current = '';
      this.completed = true;
    }
    return this.state();
  }
  async importOne(file, name, archive, ownerId, teamId, source, matchArchive = '') {
    this.current = archive === name ? name : `${archive} → ${name}`;
    const before = await stat(file);
    if (before.size < 16 || before.size > LIMIT) throw new Error('Die Demo muss zwischen 16 Bytes und 1 GiB groß sein.');
    const hash = await fingerprint(file, this.controller.signal);
    const after = await stat(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Die Datei wird noch verändert. Versuche es nach dem Download erneut.');
    if ((await this.request('/api/auth/me')).user.identitySteam64 !== ownerId)
      throw Object.assign(new Error('Das angemeldete Konto hat sich geändert. Starte den Import erneut.'), { status: 401 });
    const lookup = await this.send('/api/analysis/demos/lookup', { method: 'POST', body: JSON.stringify({ hash, teamId }) });
    let demo = lookup.demo;
    let duplicate = !!demo;
    if (!demo) {
      const created = await this.send('/api/analysis/demos', {
        method: 'POST', body: JSON.stringify({ teamId, source, title: name.replace(/\.dem(?:\.gz|\.bz2)?$/i, '').slice(0, 120), filename: name.length > 200 ? name.slice(0, 180) + name.match(/\.dem(?:\.gz|\.bz2)?$/i)[0] : name }),
      });
      try {
        const uploaded = await this.send(`/api/analysis/demos/${created.demo.id}/file`, {
          method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: await openAsBlob(file),
        });
        demo = uploaded.demo;
        duplicate = uploaded.duplicate === true;
      } catch (error) {
        // Do not delete a possibly completed upload after a lost response. The next scan finds its hash.
        const completed = await this.send('/api/analysis/demos/lookup', { method: 'POST', body: JSON.stringify({ hash, teamId }) }).catch(() => null);
        if (completed?.demo) demo = completed.demo;
        else {
          if (!this.controller.signal.aborted) await this.send(`/api/analysis/demos/${created.demo.id}`, { method: 'DELETE' }).catch(() => {});
          throw error;
        }
      }
    }
    let message = duplicate ? (demo.status === 'failed' ? 'Bereits vorhanden. Die Analyse ist fehlgeschlagen; öffne die Demo für Details.' : 'Bereits vorhanden.') : 'Hochgeladen. Die Analyse wird verarbeitet.';
    const matchId = source === 'faceit' && (faceitMatchId(name) || faceitMatchId(matchArchive));
    if (matchId) {
      try {
        const { ids } = await this.send('/api/analysis/matches/faceit', { method: 'POST', body: JSON.stringify({ teamId, matchId }) });
        if (ids.length === 1) {
          await this.send(`/api/analysis/matches/${ids[0]}/demo`, { method: 'POST', body: JSON.stringify({ demoId: demo.id }) });
          message += ' FACEIT-Match zugeordnet.';
        } else message += ' Mehrere Maps: Bitte die Demo manuell dem passenden Match zuordnen.';
      } catch { message += ' Die Matchzuordnung ist noch offen; die Demo ist gespeichert.'; }
    }
    this.results.push({ name: archive === name ? name : `${archive} → ${name}`, status: duplicate ? 'skipped' : 'uploaded', demoId: demo.id, message });
  }
}
