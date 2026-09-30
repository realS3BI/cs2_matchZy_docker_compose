import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isLineupTeam, matchesLineupTeam } from "../shared/lineup-teams.js";
import { sanitizeNades } from "../src/validators.js";
import { radarMarkerAsset, grenadeIcon, teamIcon } from "../client/src/lib/nade-assets.js";
import { groupRadarNades } from "../client/src/lib/radar-groups.js";

const base = { owner: "76561198000000001", name: "smoke", map: "de_mirage", type: "Smoke", lineupPos: "1 2 3", lineupAng: "0 90 0" };

test("team assignment validates all three values without assigning legacy recordings", () => {
  for (const team of ["t", "ct", "both"]) {
    assert.ok(isLineupTeam(team));
    assert.equal(sanitizeNades([{ ...base, team }])[0].team, team);
  }
  assert.equal(sanitizeNades([base])[0].team, undefined);
  assert.equal(sanitizeNades([{ ...base, team: "" }])[0].team, undefined);
  for (const team of ["T", "spectator", 2, null, ["t", "ct"]]) assert.throws(() => sanitizeNades([{ ...base, team }]), /Ungültige Seite/);
});

test("team filters include both-side lineups, preserve unassigned entries in All and regroup stacks", () => {
  const nades = ["t", "ct", "both", undefined].map((team, index) => ({ ...base, name: String(index), team, radarTo: { x: .5, y: .5 } }));
  const forTeam = team => nades.filter(nade => matchesLineupTeam(nade, team));
  assert.equal(forTeam("all").length, 4);
  assert.deepEqual(forTeam("t").map(n => n.team), ["t", "both"]);
  assert.deepEqual(forTeam("ct").map(n => n.team), ["ct", "both"]);
  const groups = groupRadarNades(forTeam("t"), "to", { radarWidth: 1024, radarHeight: 1024 } as any, null);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].nades.length, 2);
});

test("radar assets reflect a homogeneous team's type and keep mixed stacks neutral", () => {
  assert.equal(radarMarkerAsset([{ type: "Smoke", team: "t" }]), "/assets/nades/smoke-t.svg");
  assert.equal(radarMarkerAsset([{ type: "Flash", team: "ct" }]), "/assets/nades/flashbang-ct.svg");
  assert.equal(radarMarkerAsset([{ type: "HE", team: "both" }]), "/assets/nades/hegrenade.svg");
  assert.equal(radarMarkerAsset([{ type: "Smoke", team: "ct" }, { type: "Smoke", team: "t" }]), "/assets/nades/smoke.svg");
  assert.equal(radarMarkerAsset([{ type: "Smoke" }, { type: "Flash" }]), null);
  assert.equal(radarMarkerAsset([{ type: "Decoy" }]), null);
  assert.equal(radarMarkerAsset([]), null);
});

test("all referenced nade artwork is bundled locally and matches its downloaded source", async () => {
  const directory = new URL("../../client/public/assets/nades/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("sources.json", directory), "utf8"));
  const paths = [grenadeIcon("all"), ...["t", "ct", "both"].map(teamIcon)];
  for (const type of ["Smoke", "Flash", "Molly", "HE"]) {
    paths.push(grenadeIcon(type));
    for (const team of ["t", "ct", "both"]) paths.push(radarMarkerAsset([{ type, team }]));
  }
  for (const path of new Set(paths)) {
    assert.match(path, /^\/assets\/nades\//);
    const file = path.split("/").at(-1);
    const source = manifest.assets.find(asset => asset.file === file);
    assert.ok(source, file);
    const bytes = await readFile(new URL(file, directory));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
    if (file.endsWith(".svg")) assert.doesNotMatch(bytes.toString(), /<(script|foreignObject|image)\b|\bon\w+=|(?:href|url)=["']https?:/i);
  }
});
