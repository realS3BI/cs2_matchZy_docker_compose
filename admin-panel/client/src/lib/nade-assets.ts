const assetRoot = "/assets/nades";
const grenadeNames: Record<string, string> = { Smoke: "smoke", Flash: "flashbang", Molly: "molotov", HE: "hegrenade" };

export function grenadeIcon(type: string) {
  if (type === "all") return `${assetRoot}/all-icon.png`;
  return grenadeNames[type] ? `${assetRoot}/${grenadeNames[type]}-icon.png` : null;
}

export function teamIcon(team: string) {
  return `${assetRoot}/${team === "t" || team === "ct" ? team : "any"}.png`;
}

export function radarMarkerAsset(nades: { type?: string; team?: string }[]) {
  const first = nades[0];
  const name = grenadeNames[first?.type || ""];
  if (!name || !nades.every(nade => nade.type === first.type)) return null;
  const team = nades.every(nade => nade.team === first.team) && (first.team === "t" || first.team === "ct") ? `-${first.team}` : "";
  return `${assetRoot}/${name}${team}.svg`;
}
