import { useEffect, useRef, useState } from "react";
import { genUploader } from "uploadthing/client";
import type { ReviewFileRouter } from "../../../src/uploadthing";
import { canUploadReviewMedia, reviewFileError, type ReviewSlot } from "../../../shared/review-media";
import { THROW_ATTRIBUTE_FIELDS } from "../../../shared/throw-attributes";
import { api } from "../lib/api";

const { uploadFiles } = genUploader<ReviewFileRouter>({ url: "/api/uploadthing" });

export function useReviewUpload({ nade, user, disabled, onEntriesChange }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [retry, setRetry] = useState<{ slot: ReviewSlot; file: File; reference: any } | null>(null);
  const running = useRef(false);
  const currentNade = useRef(nade);
  currentNade.current = nade;
  useEffect(() => {
    let active = true;
    api("/api/nades/review/config").then(data => { if (active) setEnabled(data.uploadEnabled); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  async function upload(slot: ReviewSlot, file: File, reference = currentNade.current) {
    if (running.current || disabled) throw new Error("Bitte die laufende Aktion beenden und Änderungen zuerst speichern.");
    if (!enabled || !reference || !canUploadReviewMedia(reference, user)) throw new Error("Uploads sind für dieses Lineup gerade nicht verfügbar.");
    const validation = reviewFileError(slot, file);
    if (validation) throw new Error(validation);
    running.current = true;
    setUploading(true); setProgress(0); setError(""); setRetry({ slot, file, reference });
    try {
      const previous = reference;
      const { owner, map, name } = previous;
      const latest = await api("/api/nades");
      const entry = latest.entries.find(n => n.owner === owner && n.map === map && n.name === name);
      if (!entry) throw new Error("Dieses Lineup ist nicht mehr verfügbar.");
      onEntriesChange(latest.entries);
      if (!canUploadReviewMedia(entry, user)) throw new Error("Für dieses Lineup sind keine weiteren Uploads erlaubt. Es wurde möglicherweise bereits freigegeben.");
      if (["lineupPos", "lineupAng", "type", "throwTechnique", ...THROW_ATTRIBUTE_FIELDS].some(key => previous[key] !== entry[key])) {
        setRetry({ slot, file, reference: entry });
        throw new Error("Die Wurfdaten wurden geändert und sind jetzt aktualisiert. Prüfe, ob die Aufnahme noch passt, bevor du den Upload erneut versuchst.");
      }
      const options = {
        files: [file], input: { owner, map, name, revision: entry.updatedAt, slot }, onUploadProgress: ({ totalProgress }) => setProgress(totalProgress),
      };
      const result = await uploadFiles(slot === "video" ? "reviewVideo" : "reviewPhoto", options);
      if (!result?.[0]?.serverData?.saved) throw new Error("Die Datei wurde nicht bestätigt. Bitte erneut versuchen.");
      const data = await api("/api/nades");
      onEntriesChange(data.entries);
      setRetry(null);
    } catch (error) { setError(error.message || "Upload fehlgeschlagen. Die Aufnahme kann erneut hochgeladen werden."); throw error; }
    finally { running.current = false; setUploading(false); }
  }
  return { enabled, error, setError, progress, uploading, retry, upload };
}
