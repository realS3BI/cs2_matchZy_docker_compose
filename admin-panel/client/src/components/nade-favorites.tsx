import { useLiveResource } from "../hooks/use-live-resource";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import { api } from "../lib/api";
import { lineupKey, type LineupReference } from "../lib/lineups";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

const FavoritesContext = createContext<{
  has: (nade: LineupReference) => boolean;
  toggle: (nade: LineupReference) => void;
  pending: boolean;
}>(null!);

export function NadeFavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<LineupReference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const receivedLive = useRef(false);
  useEffect(() => {
    let current = true;
    api("/api/nades/favorites").then(data => {
      if (current && !receivedLive.current) { setFavorites(data.entries || []); setLoaded(true); }
    }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, []);
  useLiveResource("/api/nades/favorites", data => { receivedLive.current = true; setFavorites(data.entries || []); setLoaded(true); setError(""); }, error => setError(error.message));
  const keys = new Set(favorites.map(lineupKey));
  async function toggle(nade: LineupReference) {
    if (!loaded || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const { owner, map, name } = nade;
      const result = await api("/api/nades/favorites", { method: "PUT", body: JSON.stringify({ owner, map, name, favorite: !keys.has(lineupKey(nade)) }) });
      setFavorites(result.entries);
    } catch (error) { setError(error.message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <FavoritesContext.Provider value={{ has: nade => keys.has(lineupKey(nade)), toggle, pending: !loaded || busy }}>
    {error && <Alert variant="destructive" className="mb-5"><AlertTitle>Favoriten nicht verfügbar</AlertTitle><AlertDescription>{error} Lade die Seite erneut, um es noch einmal zu versuchen.</AlertDescription></Alert>}
    {children}
  </FavoritesContext.Provider>;
}

export const useNadeFavorites = () => useContext(FavoritesContext);

export function FavoriteButton({ nade, compact = false }: { nade: LineupReference; compact?: boolean }) {
  const favorites = useNadeFavorites();
  const selected = favorites.has(nade);
  const label = selected ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen";
  return <Button variant={selected ? "secondary" : "ghost"} size={compact ? "icon-sm" : "sm"} aria-label={label} title={label} aria-pressed={selected} disabled={favorites.pending} onClick={() => favorites.toggle(nade)}>
    <Star data-icon="inline-start" fill={selected ? "currentColor" : "none"} />{!compact && (selected ? "Gemerkt" : "Merken")}
  </Button>;
}
