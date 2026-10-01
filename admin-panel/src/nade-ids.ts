import { createHash } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const NADE_ID_PATTERN = /^[A-Za-z0-9]{7}$/;

// Derive repeatable IDs for game imports; persisted IDs remain stable after edits.
export function assignNadeIds<T extends { id?: string; owner?: string; map?: string; name?: string }>(entries: T[]): (T & { id: string })[] {
  const reserved = new Set(entries.map(entry => entry.id).filter(id => NADE_ID_PATTERN.test(id || "")));
  const used = new Set<string>();
  return entries.map(entry => {
    if (NADE_ID_PATTERN.test(entry.id || "") && !used.has(entry.id!)) {
      used.add(entry.id!);
      return entry as T & { id: string };
    }
    let id: string;
    let attempt = 0;
    do {
      const identity = JSON.stringify([entry.owner, entry.map, entry.name, attempt++]);
      let value = BigInt(`0x${createHash("sha256").update(identity).digest("hex")}`);
      id = "";
      for (let index = 0; index < 7; index++) {
        id = ALPHABET[Number(value % 62n)] + id;
        value /= 62n;
      }
    } while (reserved.has(id) || used.has(id));
    used.add(id);
    return { ...entry, id };
  });
}
