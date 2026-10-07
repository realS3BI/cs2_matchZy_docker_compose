import { api } from "./api";
import type { DemoFolderState } from "./playbook-desktop";
import { DEMO_UPLOAD_LIMIT } from "../../../shared/demos";

export const isDemoFile = (name: string) => /\.dem(?:\.gz|\.bz2)?$/i.test(name);
export const isDemoArchive = (name: string) => /\.(zip|rar|7z)$/i.test(name);
export function topLevelDemoFiles(files: File[]) {
  return files.filter(file => (!file.webkitRelativePath || file.webkitRelativePath.split("/").length === 2)
    && (isDemoFile(file.name) || isDemoArchive(file.name))).sort((a, b) => a.name.localeCompare(b.name));
}
export async function browserFileHash(file: Blob, signal: AbortSignal) {
  const { createSHA256 } = await import("hash-wasm");
  const hash = await createSHA256();
  hash.init();
  for (let start = 0; start < file.size; start += 1024 * 1024) {
    signal.throwIfAborted();
    hash.update(new Uint8Array(await file.slice(start, start + 1024 * 1024).arrayBuffer()));
  }
  return hash.digest("hex");
}
type Source = "faceit" | "premier" | "other";
type Result = DemoFolderState["results"][number];
const matchIdFromName = (name: string) => name.match(/(?:^|[^a-f0-9])(1-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?=[^a-f0-9]|$)/i)?.[1]?.toLowerCase();

export class BrowserDemoImporter {
  private controller = new AbortController();
  private ownerId = "";
  constructor(private request = api) {}
  cancel() { this.controller.abort(); }
  private async send(url: string, options = {}) {
    for (;;) {
      this.controller.signal.throwIfAborted();
      const { user } = await this.request("/api/auth/me", { signal: this.controller.signal });
      if (user.identitySteam64 !== this.ownerId) throw Object.assign(new Error("Das angemeldete Konto hat sich geändert."), { status: 401 });
      try { return await this.request(url, { ...options, signal: this.controller.signal }); }
      catch (error) {
        if (error.status !== 429) throw error;
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(this.controller.signal.reason); };
          const timer = setTimeout(() => { this.controller.signal.removeEventListener("abort", abort); resolve(); }, 15000);
          this.controller.signal.addEventListener("abort", abort, { once: true });
        });
      }
    }
  }
  async run(files: File[], teamId: string | null, source: Source, update: (state: DemoFolderState) => void) {
    const state: DemoFolderState = { folder: "", running: true, current: "", results: [], completed: false };
    const publish = () => update({ ...state, results: [...state.results] });
    const { user } = await this.request("/api/auth/me");
    this.ownerId = user.identitySteam64;
    const importOne = async (file: File, label: string, archiveName = "") => {
      state.current = `${label} · Prüfe Datei und vorhandene Demos …`; publish();
      const result = await this.importOne(file, label, archiveName, teamId, source);
      state.results.push(result); publish();
    };
    publish();
    try {
      for (const file of topLevelDemoFiles(files)) {
        if (this.controller.signal.aborted) break;
        try {
          if (isDemoArchive(file.name)) {
            state.current = `${file.name} · Archiv wird gelesen …`; publish();
            if (file.size > DEMO_UPLOAD_LIMIT) throw new Error("Das Archiv darf höchstens 1 GiB groß sein.");
            const { Archive } = await import("libarchive.js");
            const worker = new Worker("/archive/worker-bundle.js", { type: "module" });
            Archive.init({ getWorker: () => worker });
            let rejectArchive: (reason: unknown) => void;
            const failed = new Promise<never>((_, reject) => { rejectArchive = reject; });
            void failed.catch(() => {});
            const abort = () => rejectArchive(this.controller.signal.reason);
            worker.addEventListener("error", () => rejectArchive(new Error("Das Archiv konnte im Browser nicht gelesen werden.")));
            this.controller.signal.addEventListener("abort", abort, { once: true });
            const read = async <T>(operation: Promise<T>): Promise<T> => {
              let timer: ReturnType<typeof setTimeout>;
              try {
                return await Promise.race([operation, failed, new Promise<never>((_, reject) => {
                  timer = setTimeout(() => reject(new Error("Das Entpacken dauert zu lange. Entpacke das Archiv zuerst lokal.")), 5 * 60_000);
                })]);
              } finally { clearTimeout(timer); }
            };
            let archive: Awaited<ReturnType<typeof Archive.open>>;
            try {
              this.controller.signal.throwIfAborted();
              archive = await read(Archive.open(file));
              if (await read(archive.hasEncryptedData())) throw new Error("Passwortgeschützte Archive werden nicht unterstützt.");
              const entries = (await read(archive.getFilesArray())).filter(entry => isDemoFile(entry.file.name));
              if (!entries.length) throw new Error("Das Archiv enthält keine unterstützten Demo-Dateien.");
              if (entries.length > 100 || entries.some(entry => entry.file.size > DEMO_UPLOAD_LIMIT)
                || entries.reduce((sum, entry) => sum + entry.file.size, 0) > 3 * DEMO_UPLOAD_LIMIT)
                throw new Error("Das Archiv enthält zu große oder zu viele Demos.");
              for (const entry of entries) {
                this.controller.signal.throwIfAborted();
                try { await importOne(await read<File>(entry.file.extract()), `${file.name} → ${entry.file.name}`, entries.length === 1 ? file.name : ""); }
                catch (error) {
                  if (this.controller.signal.aborted || [401, 403].includes(error.status)) throw error;
                  state.results.push({ name: `${file.name} → ${entry.file.name}`, status: "failed", message: error.message }); publish();
                }
              }
            } finally { this.controller.signal.removeEventListener("abort", abort); await archive?.close(); worker.terminate(); }
          } else await importOne(file, file.name);
        } catch (error) {
          state.results.push({ name: file.name, status: "failed", message: this.controller.signal.aborted ? "Import abgebrochen. Wähle beim nächsten Import den Ordner erneut aus." : error.message }); publish();
          if (this.controller.signal.aborted || [401, 403].includes(error.status)) break;
        }
      }
    } finally { state.running = false; state.current = ""; state.completed = true; publish(); }
    return state;
  }
  private async importOne(file: File, label: string, archiveName: string, teamId: string | null, source: Source): Promise<Result> {
    if (file.size < 16 || file.size > DEMO_UPLOAD_LIMIT) throw new Error("Die Demo muss zwischen 16 Bytes und 1 GiB groß sein.");
    const hash = await browserFileHash(file, this.controller.signal);
    const lookupOptions = { method: "POST", body: JSON.stringify({ hash, teamId }) };
    let { demo } = await this.send("/api/analysis/demos/lookup", lookupOptions);
    let duplicate = !!demo;
    if (!demo) {
      const suffix = file.name.match(/\.dem(?:\.gz|\.bz2)?$/i)?.[0] || ".dem";
      const created = await this.send("/api/analysis/demos", { method: "POST", body: JSON.stringify({ teamId, source,
        filename: file.name.length > 200 ? file.name.slice(0, 180) + suffix : file.name,
        title: file.name.replace(/\.dem(?:\.gz|\.bz2)?$/i, "").slice(0, 120),
      }) });
      try {
        const result = await this.send(`/api/analysis/demos/${created.demo.id}/file`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file });
        demo = result.demo; duplicate = result.duplicate === true;
      } catch (error) {
        const completed = await this.send("/api/analysis/demos/lookup", lookupOptions).catch(() => null);
        if (completed?.demo) demo = completed.demo;
        else {
          if (!this.controller.signal.aborted) await this.send(`/api/analysis/demos/${created.demo.id}`, { method: "DELETE" }).catch(() => {});
          throw error;
        }
      }
    }
    let message = duplicate ? "Bereits vorhanden." : "Hochgeladen. Die Analyse wird verarbeitet.";
    const matchId = source === "faceit" && (matchIdFromName(file.name) || matchIdFromName(archiveName));
    if (matchId) {
      try {
        const { ids } = await this.send("/api/analysis/matches/faceit", { method: "POST", body: JSON.stringify({ teamId, matchId }) });
        if (ids.length === 1) { await this.send(`/api/analysis/matches/${ids[0]}/demo`, { method: "POST", body: JSON.stringify({ demoId: demo.id }) }); message += " FACEIT-Match zugeordnet."; }
        else message += " Mehrere Maps: Bitte die Demo manuell zuordnen.";
      } catch { message += " Die Matchzuordnung ist noch offen; die Demo ist gespeichert."; }
    }
    return { name: label, status: duplicate ? "skipped" : "uploaded", demoId: demo.id, message };
  }
}
