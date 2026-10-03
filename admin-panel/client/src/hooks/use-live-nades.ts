import { useEffect } from "react";

export function useLiveNades(authenticated: boolean, onEntriesChange: (entries: any[]) => void) {
  useEffect(() => {
    if (!authenticated) return;
    const events = new EventSource("/api/nades/events");
    events.addEventListener("library", event => {
      try {
        const { entries } = JSON.parse((event as MessageEvent).data);
        if (Array.isArray(entries)) onEntriesChange(entries);
      } catch { /* EventSource reconnects and receives a full snapshot. */ }
    });
    return () => events.close();
  }, [authenticated, onEntriesChange]);
}
