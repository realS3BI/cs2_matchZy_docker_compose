import { createRouteHandler, createUploadthing, type FileRouter } from "uploadthing/express";
import { UTApi } from "uploadthing/server";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";
import { authenticatedUser } from "./auth.js";
import { attachReviewMedia, reviewEntry } from "./review-media.js";
import { reviewFileError } from "../shared/review-media.js";
import { getVideoPreview } from "./video-preview.js";

const inputSchema = z.object({
  owner: z.string().min(1).max(500), map: z.string().min(1).max(500), name: z.string().min(1).max(500),
  revision: z.string().min(1).max(100), slot: z.enum(["aim", "position", "front", "effect", "video"]),
});

export function createReviewFileRouter({ config, store, changeEntries, utapi, preparePreview = undefined }) {
  const f = createUploadthing();
  const authorize = async ({ req, input, files }) => {
    if ((req.headers.origin && req.headers.origin !== config.publicUrl) || req.headers["sec-fetch-site"] === "cross-site")
      throw new UploadThingError("Anfrage von dieser Herkunft ist nicht erlaubt.");
    const user = await authenticatedUser(req, config, store);
    if (!user) throw new UploadThingError("Bitte anmelden.");
    const entry = reviewEntry(await store.getNades(), input, user);
    if (entry.updatedAt !== input.revision) throw new UploadThingError("Das Lineup wurde geändert. Bitte aktualisieren.");
    const error = files.length !== 1 ? "Bitte genau eine Datei hochladen." : reviewFileError(input.slot, files[0]);
    if (error) throw new UploadThingError(error);
    return { ...input, actor: user.identitySteam64, role: user.role };
  };
  const complete = async ({ metadata, file }) => {
    let previousKey: string | undefined;
    try {
      const existing = (await store.getNades()).find(n => n.owner === metadata.owner && n.map === metadata.map && n.name === metadata.name);
      if (existing?.reviewMedia?.[metadata.slot]?.key === file.key) return { saved: true, updatedAt: existing.updatedAt };
      const currentUser = await store.getUser(metadata.actor);
      // A test/player session must never inherit a later admin elevation.
      const user = currentUser && { ...currentUser, role: metadata.role === "admin" ? currentUser.role : "player" };
      if (!user) throw new Error("Die Upload-Berechtigung ist abgelaufen.");
      const entries = await changeEntries(entries => {
        const previous = reviewEntry(entries, metadata, user).reviewMedia?.[metadata.slot];
        previousKey = previous?.key;
        return attachReviewMedia(entries, metadata, user, {
          key: file.key, url: file.ufsUrl, name: file.name, size: file.size, mime: file.type, uploadedAt: new Date().toISOString(),
        });
      });
      if (previousKey && previousKey !== file.key) await utapi.deleteFiles(previousKey).catch(() => {});
      const saved = reviewEntry(entries, metadata, user);
      // Prepare the small version during review, before the lineup becomes official.
      if (metadata.slot === "video" && preparePreview) void preparePreview(saved.reviewMedia.video).catch(() => {});
      return { saved: true, updatedAt: saved.updatedAt };
    } catch (error) {
      // Do not retain an unassigned file after a revoked permission or stale upload.
      const assigned = (await store.getNades()).some(n => Object.values(n.reviewMedia || {}).some((media: any) => media.key === file.key));
      if (!assigned) await utapi.deleteFiles(file.key).catch(() => {});
      throw new UploadThingError(error.message || "Die Datei konnte nicht zugeordnet werden.");
    }
  };
  return {
    reviewPhoto: f({ "image/jpeg": { maxFileSize: "8MB", maxFileCount: 1, minFileCount: 0 }, "image/png": { maxFileSize: "8MB", maxFileCount: 1, minFileCount: 0 }, "image/webp": { maxFileSize: "8MB", maxFileCount: 1, minFileCount: 0 } })
      .input(inputSchema).middleware(authorize).onUploadComplete(complete),
    reviewVideo: f({ "video/mp4": { maxFileSize: "128MB", maxFileCount: 1, minFileCount: 0 }, "video/webm": { maxFileSize: "128MB", maxFileCount: 1, minFileCount: 0 } })
      .input(inputSchema).middleware(authorize).onUploadComplete(complete),
  } satisfies FileRouter;
}
export type ReviewFileRouter = ReturnType<typeof createReviewFileRouter>;

export function installReviewUploads(app, dependencies) {
  const { config } = dependencies;
  if (!config.uploadthingToken) {
    app.use("/api/uploadthing", (_req, res) => res.status(503).json({ error: "UploadThing ist noch nicht eingerichtet." }));
    return;
  }
  const utapi = new UTApi({ token: config.uploadthingToken });
  // The SDK verifies callback signatures. Browser initialization is authenticated
  // in the route middleware; callbacks have no browser session cookie.
  app.use("/api/uploadthing", createRouteHandler({
    router: createReviewFileRouter({ ...dependencies, utapi, preparePreview: getVideoPreview }),
    config: { token: config.uploadthingToken, callbackUrl: `${config.publicUrl}/api/uploadthing` },
  }));
}
