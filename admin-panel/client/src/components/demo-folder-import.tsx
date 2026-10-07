import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { desktop, type DemoFolderState } from "@/lib/playbook-desktop";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/card";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "./ui/field";
import { Input } from "./ui/input";
import { Choice, Feedback } from "./workspace-ui";
import { BrowserDemoFolderImport } from "./browser-demo-folder-import";

export function DemoFolderImport({ teamId, onImported }: { teamId: string | null; onImported: () => void }) {
  const [state, setState] = useState<DemoFolderState | null>(null);
  const [folder, setFolder] = useState("");
  const [source, setSource] = useState<"faceit" | "premier" | "other">("faceit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!desktop?.demoFolderStatus) return;
    let disposed = false;
    void desktop.demoFolderStatus().then(value => {
      if (!disposed) { setState(value); setFolder(value.folder); }
    }).catch(cause => { if (!disposed) setError(cause.message); });
    const timer = setInterval(() => {
      void desktop.demoFolderStatus().then(value => { if (!disposed) setState(value); })
        .catch(cause => { if (!disposed) setError(cause.message); });
    }, 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  if (!desktop?.demoFolderImport) return <BrowserDemoFolderImport teamId={teamId} onImported={onImported} />;
  const running = busy || state?.running;
  async function choose() {
    setBusy(true); setError("");
    try { const value = await desktop.demoFolderChoose(); setState(value); setFolder(value.folder); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); setError("");
    try {
      if (folder.trim() !== state?.folder) setState(await desktop.demoFolderSet(folder.trim()));
      setState(await desktop.demoFolderImport({ teamId, source }));
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); onImported(); }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demos aus einem Ordner importieren</CardTitle>
        <CardDescription>
          Lade deine Demos selbst herunter und starte den Import hier.
          Der Ordner bleibt gespeichert. Vorhandene Demos werden im gewählten Arbeitsbereich übersprungen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel id="demo-folder-label">Lokaler Demo-Ordner</FieldLabel>
            <Input aria-labelledby="demo-folder-label" value={folder}
              onChange={event => setFolder(event.target.value)} disabled={running}
              placeholder="C:\\Users\\Name\\Downloads\\Demos" />
            <Button variant="outline" disabled={running} onClick={() => void choose()}>Ordner auswählen</Button>
            <FieldDescription>
              .dem, .dem.gz, .dem.bz2 sowie Demos in ZIP-, RAR- und 7z-Archiven.
              Nur Dateien direkt in diesem Ordner. Deine Originaldateien bleiben erhalten.
            </FieldDescription>
          </Field>
          <Choice label="Herkunft der Demos" value={source} disabled={running}
            onChange={value => { if (value === "faceit" || value === "premier" || value === "other") setSource(value); }} options={[
              { value: "faceit", label: "FACEIT" }, { value: "premier", label: "Premier / Matchmaking" }, { value: "other", label: "Andere" },
            ]} />
          <Feedback error={error || state?.error} />
          {running && <p role="status" className="text-sm">{state?.current || "Ordner wird geprüft …"}</p>}
          {!running && state?.completed && <p role="status" className="text-sm">
            {state.results.filter(result => result.status === "uploaded").length} hochgeladen ·{" "}
            {state.results.filter(result => result.status === "skipped").length} bereits vorhanden ·{" "}
            {state.results.filter(result => result.status === "failed").length} fehlgeschlagen
          </p>}
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto" aria-label="Ergebnisse des Ordnerimports">
            {state?.results.map((result, index) => <div key={index} className="text-sm">
              <p className="break-all font-medium">{result.name}</p>
              <p>{result.message}</p>
              {result.demoId && <Link to={`/analysis/demos/${result.demoId}`}>Demo öffnen</Link>}
            </div>)}
          </div>
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled={running || !folder.trim()} onClick={() => void run()}>Ordner importieren</Button>
        {state?.running && <Button variant="outline" onClick={() => void desktop.demoFolderCancel().then(setState).catch(cause => setError(cause.message))}>Abbrechen</Button>}
      </CardFooter>
    </Card>
  );
}
