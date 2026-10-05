import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  liveState,
  subscribeLive,
  subscribeLiveState,
  type LiveMessage,
} from "@/lib/live";

export function useLiveState() {
  return useSyncExternalStore(subscribeLiveState, liveState);
}

export function useLiveResource(
  path: string | null,
  onData: (data: any) => void,
  onError?: (error: { status: number; message: string }) => void,
) {
  const handlers = useRef({ onData, onError });
  handlers.current = { onData, onError };
  useEffect(() => {
    if (!path) return;
    return subscribeLive(path, (message: LiveMessage) => {
      if (message.type === "snapshot") handlers.current.onData(message.data);
      else
        handlers.current.onError?.({
          status: message.status,
          message: message.error,
        });
    });
  }, [path]);
}
