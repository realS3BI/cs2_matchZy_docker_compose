import { useEffect, useState } from "react";
import { ArrowLeftRight, MapPinned, RefreshCw, UploadCloud } from "lucide-react";
import { api } from "../lib/api";
import { BUILT_IN_MAPS, workshopMapsFromSettings } from "../lib/maps";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { NativeSelect } from "./ui/native-select";
import { Spinner } from "./ui/spinner";

export function ServerControls({ settings, setSettings, policy, busy, running, onApply }) {
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedMap, setSelectedMap] = useState(settings.startMap || "de_mirage");
  const maps = BUILT_IN_MAPS.filter((map) => map.category !== "community");
  const workshops = workshopMapsFromSettings(settings);
  const mode = policy?.modes?.find((item) => item.id === settings.serverMode);
  const disabled = busy || switching;
  const liveMapSelected = game?.map === selectedMap;

  async function refreshGame() {
    setLoading(true);
    setError("");
    try {
      setGame(await api("/api/server/game"));
    } catch (error) {
      setGame(null);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (busy || !running) { setGame(null); return; }
    let cancelled = false;
    setLoading(true);
    api("/api/server/game").then((result) => {
      if (!cancelled) { setGame(result); setError(""); }
    }).catch((error) => {
      if (!cancelled) { setGame(null); setError(error.message); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [busy, running]);

  async function changeMap() {
    setSwitching(true);
    setMessage("");
    setError("");
    try {
      const workshop = workshops.find((map) => map.key === selectedMap);
      const result = await api("/api/server/map", {
        method: "POST",
        body: JSON.stringify(workshop ? { workshopId: workshop.workshopId } : { map: selectedMap })
      });
      setGame(null);
      setMessage(result.message);
    } catch (error) {
      setError(error.message);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row">
        <div className="grid gap-1.5"><CardTitle>Quick controls</CardTitle><CardDescription>Choose how and where to play.</CardDescription></div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={game?.map ? "success" : "outline"}><MapPinned className="size-3" />Live map: {game?.map || (loading ? "Checking…" : "Unavailable")}</Badge>
          <Button variant="ghost" size="sm" onClick={refreshGame} disabled={disabled || loading || !running}><RefreshCw className="size-4" />Refresh live map</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <Field>
              <FieldLabel>Server mode</FieldLabel>
              <NativeSelect value={settings.serverMode || "matchzy"} disabled={disabled} onChange={(event) => setSettings((current) => ({ ...current, serverMode: event.target.value }))}>
                {(policy?.modes || []).map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
              </NativeSelect>
              <FieldDescription>{mode?.description}</FieldDescription>
            </Field>
            <p className="text-xs text-muted-foreground">Applied mode: {policy?.modes?.find((mode) => mode.id === game?.mode)?.name || "Unavailable"}. Applying saves all configuration edits and restarts CS2.</p>
            <Button className="mt-auto self-start" onClick={onApply} disabled={disabled}><UploadCloud data-icon="inline-start" />Apply &amp; restart</Button>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <Field>
              <FieldLabel>Play map</FieldLabel>
              <NativeSelect value={selectedMap} disabled={disabled} onChange={(event) => setSelectedMap(event.target.value)}>
                {!maps.some((map) => map.mapName === selectedMap) && !workshops.some((map) => map.key === selectedMap) ? <option value={selectedMap}>{selectedMap}</option> : null}
                <optgroup label="Server maps">{maps.map((map) => <option key={map.key} value={map.mapName}>{map.name}</option>)}</optgroup>
                {workshops.length > 0 ? <optgroup label="Workshop maps">{workshops.map((map) => <option key={map.key} value={map.key}>{map.name}</option>)}</optgroup> : null}
              </NativeSelect>
              <FieldDescription>Switches the running game immediately. Players load the new map; the container stays running.</FieldDescription>
            </Field>
            <p className="text-xs text-muted-foreground">Start map: {settings.startMap}. Workshop maps must be applied first.</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button onClick={changeMap} disabled={disabled || loading || !running || liveMapSelected}>{switching ? <Spinner /> : <ArrowLeftRight data-icon="inline-start" />}{switching ? "Switching…" : "Switch map"}</Button>
              <Button variant="secondary" disabled={disabled || selectedMap.startsWith("workshop-") || settings.startMap === selectedMap} onClick={() => setSettings((current) => ({ ...current, startMap: selectedMap }))}>Use as start map</Button>
            </div>
          </div>
        </div>
        {!running ? <p className="text-sm text-muted-foreground">Start the server to use the live map controls.</p> : null}
        <div aria-live="polite">
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : message ? <Alert variant="success"><AlertDescription>{message}</AlertDescription></Alert> : null}
        </div>
      </CardContent>
    </Card>
  );
}
