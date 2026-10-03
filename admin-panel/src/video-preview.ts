import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sanitizeReviewMedia } from "./review-media.js";

const run = promisify(execFile);
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const CACHE_LIFETIME = 7 * 24 * 60 * 60 * 1000;

export async function encodeVideoPreview(input: string, output: string) {
  await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", input,
    "-vf", "scale=480:-2,fps=12", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1",
    "-preset", "veryfast", "-crf", "32", "-maxrate", "350k", "-bufsize", "700k", "-movflags", "+faststart", output],
    { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true });
}

// Keys and URLs come exclusively from verified review uploads, never from a request URL.
export function createVideoPreviewCache({ directory = join(tmpdir(), "playbook-video-previews"), encode = encodeVideoPreview, download = fetch } = {}) {
  const pending = new Map<string, Promise<string>>();
  let cleaning: Promise<void> | undefined;
  async function cleanCache() {
    const files = await Promise.all((await readdir(directory)).filter(name => /^[\w-]+\.mp4$/.test(name)).map(async name => ({ name, info: await stat(join(directory, name)) })));
    files.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
    await Promise.all(files.filter((file, index) => index >= 128 || Date.now() - file.info.mtimeMs > CACHE_LIFETIME).map(file => rm(join(directory, file.name), { force: true })));
  }
  return async function preview(file) {
    const verified = sanitizeReviewMedia({ video: file }).video!;
    const output = join(directory, `${verified.key}.mp4`);
    if (pending.has(verified.key)) return pending.get(verified.key)!;
    try { if (Date.now() - (await stat(output)).mtimeMs < CACHE_LIFETIME) return output; } catch {}
    if (pending.has(verified.key)) return pending.get(verified.key)!;
    // Bound CPU and temporary disk usage. The client can open the original if busy.
    if (pending.size >= 2) throw Object.assign(new Error("Die Videovorschau wird vorbereitet. Bitte später erneut versuchen."), { status: 503 });
    const task = (async () => {
      await mkdir(directory, { recursive: true });
      if (!cleaning) cleaning = cleanCache().finally(() => { cleaning = undefined; });
      await cleaning;
      const workspace = await mkdtemp(join(directory, "encoding-"));
      try {
        const response = await download(verified.url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
        if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) throw new Error("Video konnte nicht geladen werden.");
        const input = join(workspace, "source");
        const handle = await open(input, "w");
        let size = 0;
        try {
          for await (const chunk of response.body) {
            size += chunk.length;
            if (size > MAX_SOURCE_BYTES) throw new Error("Video ist zu groß.");
            await handle.write(chunk);
          }
        } finally { await handle.close(); }
        if (!size) throw new Error("Video ist leer.");
        const encoded = join(workspace, "preview.mp4");
        await encode(input, encoded);
        await rename(encoded, output);
        return output;
      } finally { await rm(workspace, { recursive: true, force: true }); }
    })();
    pending.set(verified.key, task);
    try { return await task; } finally { pending.delete(verified.key); }
  };
}

export const getVideoPreview = createVideoPreviewCache();

export function installVideoPreviews(app, { store, preview = getVideoPreview }) {
  app.get("/api/nades/video-preview/:key", async (req, res) => {
    const key = String(req.params.key);
    if (!/^[\w-]{1,256}$/.test(key)) { res.status(404).end(); return; }
    try {
      const entry = (await store.getNades()).find(nade => nade.official && nade.reviewMedia?.video?.key === key);
      if (!entry) { res.status(404).end(); return; }
      const path = await preview(entry.reviewMedia.video);
      // A withdrawal during encoding must also withdraw the preview.
      if (!(await store.getNades()).some(nade => nade.official && nade.reviewMedia?.video?.key === key)) { res.status(404).end(); return; }
      res.set("Cache-Control", "private, no-cache");
      res.sendFile(path, error => { if (error && !res.headersSent) res.status(503).end(); });
    } catch { if (!res.headersSent) res.status(503).json({ error: "Die Videovorschau ist gerade nicht verfügbar." }); }
  });
}
