import type { Request, Response } from "express";

// One stream per browser; all writes (captures, reviews, uploads, deletion) publish after commit.
export class NadeEvents {
  private listeners = new Set<(entries: any[]) => void>();

  publish(entries: any[]) {
    for (const listener of this.listeners) listener(entries);
  }

  async stream(req: Request, res: Response, read: () => Promise<any[]>) {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    let changed = false;
    const send = (entries: any[]) => {
      changed = true;
      if (res.destroyed || res.writableLength > 4 * 1024 * 1024) { res.destroy(); return; }
      res.write(`event: library\ndata: ${JSON.stringify({ entries })}\n\n`);
    };
    this.listeners.add(send);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25000);
    heartbeat.unref();
    res.on("close", () => { clearInterval(heartbeat); this.listeners.delete(send); });
    try {
      const entries = await read();
      // A commit during the initial read already sent a newer snapshot.
      if (!changed && !res.destroyed) send(entries);
    } catch { res.end(); }
  }
}
