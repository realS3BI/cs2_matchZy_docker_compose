import { useLiveResource } from "../hooks/use-live-resource";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, MapPinned, RefreshCw, UploadCloud } from "lucide-react";
import { api } from "../lib/api";
import { BUILT_IN_MAPS, workshopMapsFromSettings } from "../lib/maps";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ActionButton } from "./action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select";

export function ServerControls({ settings, setSettings, policy, busy, running, onApply }) {
  const gameVersion = useRef(0);
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
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
      const version = gameVersion.current;
      const data = await api("/api/server/game");
      if (version === gameVersion.current) setGame(data);
    } catch (error) {
      setGame(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (busy || !running) { setGame(null); return; }
    let cancelled = false;
    setLoading(true);
    const version = gameVersion.current;
    api("/api/server/game").then((result) => {
      if (!cancelled && version === gameVersion.current) { setGame(result); setError(""); }
    }).catch((error) => {
      if (!cancelled) { setGame(null); setError(error.message); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [busy, running]);

  useLiveResource(running ? "/api/server/game" : null, data => { gameVersion.current++; setGame(data); setError(""); }, error => { setGame(null); setError(error.message); });

  async function changeMap() {
    setSwitching(true);
    setError("");
    try {
      const workshop = workshops.find((map) => map.key === selectedMap);
      await api("/api/server/map", {
        method: "POST",
        body: JSON.stringify(workshop ? { workshopId: workshop.workshopId } : { map: selectedMap })
      });
      setGame(null);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row">
        <div className="grid gap-1.5"><CardTitle>Nächste Session vorbereiten</CardTitle><CardDescription>Wähle den Spielmodus und die Map für eure Session.</CardDescription></div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={game?.map ? "success" : "outline"}><MapPinned className="size-3" />Aktuelle Map: {game?.map || (loading ? "Wird geprüft …" : "Nicht verfügbar")}</Badge>
          <ActionButton variant="ghost" size="sm" onClick={refreshGame} disabled={disabled || loading || !running} icon={RefreshCw} pendingLabel="Wird aktualisiert …" successLabel="Aktualisiert">Live-Map aktualisieren</ActionButton>
          {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <Field>
              <FieldLabel>Spielmodus</FieldLabel>
              <Select value={settings.serverMode || "matchzy"} disabled={disabled} onValueChange={(value) => setSettings((current) => ({ ...current, serverMode: value }))}>
                <SelectTrigger aria-label="Spielmodus"><SelectValue placeholder="Modus auswählen" /></SelectTrigger>
                <SelectContent>{(policy?.modes || []).map((mode) => <SelectItem key={mode.id} value={mode.id}>{mode.name}</SelectItem>)}</SelectContent>
              </Select>
              <FieldDescription>{mode?.description}</FieldDescription>
            </Field>
            <p className="text-xs text-muted-foreground">Aktiver Modus: {policy?.modes?.find((mode) => mode.id === game?.mode)?.name || "Nicht verfügbar"}. Übernehmen speichert alle Änderungen und startet CS2 neu.</p>
            <ActionButton variant="secondary" onClick={onApply} disabled={disabled} icon={UploadCloud} pendingLabel="Wird übernommen …" successLabel="Übernommen">Übernehmen & neu starten</ActionButton>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4">
            <Field>
              <FieldLabel>Map spielen</FieldLabel>
              <Select value={selectedMap} disabled={disabled} onValueChange={setSelectedMap}>
                <SelectTrigger aria-label="Map spielen"><SelectValue placeholder="Map auswählen" /></SelectTrigger>
                <SelectContent>
                  {!maps.some((map) => map.mapName === selectedMap) && !workshops.some((map) => map.key === selectedMap) ? <SelectItem value={selectedMap}>{selectedMap}</SelectItem> : null}
                  <SelectGroup><SelectLabel>Server-Maps</SelectLabel>{maps.map((map) => <SelectItem key={map.key} value={map.mapName}>{map.name}</SelectItem>)}</SelectGroup>
                  {workshops.length > 0 ? <SelectGroup><SelectLabel>Workshop-Maps</SelectLabel>{workshops.map((map) => <SelectItem key={map.key} value={map.key}>{map.name}</SelectItem>)}</SelectGroup> : null}
                </SelectContent>
              </Select>
              <FieldDescription>Wechselt sofort die Map im laufenden Spiel. Verbundene Spieler laden die neue Map.</FieldDescription>
            </Field>
            <p className="text-xs text-muted-foreground">Startmap: {settings.startMap}. Neue Workshop-Maps musst du zuerst übernehmen.</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={changeMap} disabled={disabled || loading || !running || liveMapSelected} icon={ArrowLeftRight} pendingLabel="Map wird gewechselt …" successLabel="Map-Wechsel gestartet">Map wechseln</ActionButton>
              <Button variant="secondary" disabled={disabled || selectedMap.startsWith("workshop-") || settings.startMap === selectedMap} onClick={() => setSettings((current) => ({ ...current, startMap: selectedMap }))}>Als Startmap vormerken</Button>
            </div>
          </div>
        </div>
        {!running ? <p className="text-sm text-muted-foreground">Starte den Server, um die Map im laufenden Spiel zu wechseln.</p> : null}
      </CardContent>
    </Card>
  );
}
