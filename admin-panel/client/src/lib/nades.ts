const SETPOS_SETANG_RE = /^setpos\s+(-?(?:\d+(?:\.\d+)?|\.\d+))\s+(-?(?:\d+(?:\.\d+)?|\.\d+))\s+(-?(?:\d+(?:\.\d+)?|\.\d+))\s*;\s*setang\s+(-?(?:\d+(?:\.\d+)?|\.\d+))\s+(-?(?:\d+(?:\.\d+)?|\.\d+))\s+(-?(?:\d+(?:\.\d+)?|\.\d+))$/i;

export function parseSetposSetang(value: string) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  const match = normalized.match(SETPOS_SETANG_RE);
  if (!match) return null;
  return {
    lineupPos: `${match[1]} ${match[2]} ${match[3]}`,
    lineupAng: `${match[4]} ${match[5]} ${match[6]}`
  };
}
