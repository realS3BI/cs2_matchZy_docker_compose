import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BrowserDemoImporter } from "@/lib/browser-demo-folder";
import type { DemoFolderState } from "@/lib/playbook-desktop";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/card";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "./ui/field";
import { Choice, Feedback } from "./workspace-ui";

type Directory = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};
declare global { interface Window { showDirectoryPicker?: (options: { id: string; mode: "read" }) => Promise<Directory>; } }
async function storedDirectory(value?: Directory): Promise<Directory | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("playbook-demo-folder", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("folders");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const tx = db.transaction("folders", value ? "readwrite" : "readonly");
        const store = tx.objectStore("folders");
        const request = value ? store.put(value, "selected") : store.get("selected");
        tx.oncomplete = () => {
          db.close();
          const handle = value || request.result;
          resolve(handle?.kind === "directory" && typeof handle.values === "function" ? handle : undefined);
        };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
      } catch (cause) { db.close(); reject(cause); }
    };
  });
}

export function BrowserDemoFolderImport({ teamId, onImported }: { teamId: string | null; onImported: () => void }) {
  const [directory, setDirectory] = useState<Directory | undefined>();
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState<"faceit" | "premier" | "other">("faceit");
  const [state, setState] = useState<DemoFolderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const importer = useRef<BrowserDemoImporter | null>(null);
  const selected = useRef(false);
  useEffect(() => {
    let disposed = false;
    if (window.showDirectoryPicker) void storedDirectory().then(handle => {
      if (!disposed && !selected.current && handle) { setDirectory(handle); setName(handle.name); }
    }).catch(() => {});
    return () => { disposed = true; importer.current?.cancel(); };
  }, []);
  async function choose() {
    setError("");
    if (!window.showDirectoryPicker) { input.current?.click(); return; }
    try {
      const handle = await window.showDirectoryPicker({ id: "playbook-demos", mode: "read" });
      selected.current = true;
      setDirectory(handle); setFiles([]); setName(handle.name); setState(null);
      await storedDirectory(handle).catch(() => setError("Der Ordner ist ausgewählt, konnte aber für den nächsten Besuch nicht gespeichert werden."));
    } catch (cause) { if (cause.name !== "AbortError") setError(cause.message); }
  }
  async function run() {
    setBusy(true); setError(""); setState(null);
    try {
      let entries = files;
      if (directory) {
        if (await directory.queryPermission({ mode: "read" }) !== "granted"
          && await directory.requestPermission({ mode: "read" }) !== "granted") throw new Error("Gib den ausgewählten Ordner zum Lesen frei.");
        entries = [];
        for await (const entry of directory.values()) if (entry.kind === "file") entries.push(await entry.getFile());
      }
      importer.current = new BrowserDemoImporter();
      await importer.current.run(entries, teamId, source, setState);
    } catch (cause) { setError(cause.message); }
    finally { importer.current = null; setBusy(false); onImported(); }
  }
  return <Card>
    <CardHeader>
      <CardTitle>Demos aus einem Ordner importieren</CardTitle>
      <CardDescription>Wähle deinen lokalen Demo-Ordner und starte den Import per Button. Vorhandene Inhalte werden im gewählten Arbeitsbereich übersprungen.</CardDescription>
    </CardHeader>
    <CardContent>
      <FieldGroup>
        <Field>
          <FieldLabel>Lokaler Demo-Ordner</FieldLabel>
          <p className="break-all text-sm">{name || "Noch kein Ordner ausgewählt"}</p>
          <input type="file" multiple hidden aria-label="Demo-Ordner auswählen" ref={node => { input.current = node; if (node) node.webkitdirectory = true; }} onChange={event => {
            const entries = Array.from(event.target.files || []);
            selected.current = true;
            setDirectory(undefined); setFiles(entries); setName(entries[0]?.webkitRelativePath.split("/")[0] || "Ausgewählter Ordner"); setState(null);
            event.target.value = "";
          }} />
          <Button variant="outline" disabled={busy} onClick={() => void choose()}>Ordner auswählen</Button>
          <FieldDescription>
            Der Browser benötigt deine Ordnerfreigabe; ein eingetippter Pfad genügt nicht.
            {window.showDirectoryPicker ? " Der ausgewählte Ordner wird für spätere Imports gespeichert." : " Wähle den Ordner erneut aus, wenn neue Dateien darin liegen."}
          </FieldDescription>
          <FieldDescription>.dem, .dem.gz, .dem.bz2 und Demos in ZIP-, RAR- und 7z-Archiven. Nur Dateien direkt im gewählten Ordner. Deine Originaldateien bleiben erhalten.</FieldDescription>
        </Field>
        <Choice label="Herkunft der Demos" value={source} disabled={busy} onChange={value => { if (value === "faceit" || value === "premier" || value === "other") setSource(value); }} options={[
          { value: "faceit", label: "FACEIT" }, { value: "premier", label: "Premier / Matchmaking" }, { value: "other", label: "Andere" },
        ]} />
        <Feedback error={error} />
        {busy && <p role="status" className="text-sm">{state?.current || "Ordner wird geprüft …"} Bei belegten Importplätzen wartet der Import automatisch.</p>}
        {!busy && state?.completed && <p role="status" className="text-sm">{state.results.filter(result => result.status === "uploaded").length} hochgeladen · {state.results.filter(result => result.status === "skipped").length} bereits vorhanden · {state.results.filter(result => result.status === "failed").length} fehlgeschlagen</p>}
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto" aria-label="Ergebnisse des Ordnerimports">
          {state?.results.map((result, index) => <div key={index} className="text-sm"><p className="break-all font-medium">{result.name}</p><p>{result.message}</p>{result.demoId && <Link to={`/analysis/demos/${result.demoId}`}>Demo öffnen</Link>}</div>)}
        </div>
      </FieldGroup>
    </CardContent>
    <CardFooter className="flex flex-wrap gap-2">
      <Button disabled={busy || !name} onClick={() => void run()}>Ordner importieren</Button>
      {busy && <Button variant="outline" onClick={() => importer.current?.cancel()}>Abbrechen</Button>}
    </CardFooter>
  </Card>;
}
