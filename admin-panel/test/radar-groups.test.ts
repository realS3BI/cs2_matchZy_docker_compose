import test from "node:test";
import assert from "node:assert/strict";
import { groupRadarNades, findRadarGroup } from "../client/src/lib/radar-groups.js";
import { lineupId } from "../client/src/lib/lineups.js";
import { ACTIVE_DUTY_MAPS } from "../client/src/lib/maps.js";
import { inferRadarCalibration } from "../client/src/lib/nade-radar.js";

const map = ACTIVE_DUTY_MAPS.find(map => map.key === "anubis")!;
const nade = (name: string, from = { x: 0.2, y: 0.3 }, to = { x: 0.7, y: 0.6 }) => ({
  owner: "player", map: map.mapName, name, radarFrom: from, radarTo: to,
});

test("Nuke groups upper and lower positions separately and displays recordings that have no manual markers", () => {
  const nuke = ACTIVE_DUTY_MAPS.find(map => map.mapName === "de_nuke")!;
  const entries = [
    { owner: "player", map: "de_nuke", name: "a", lineupPos: "650 -700 -400", landingPos: "650 -1100 -768" },
    { owner: "player", map: "de_nuke", name: "b", lineupPos: "650 -700 -400", landingPos: "650 -1100 -400" },
    { owner: "player", map: "de_nuke", name: "c", lineupPos: "650 -700 -768", landingPos: "650 -1100 -768" },
  ];
  const calibration = inferRadarCalibration(nuke, entries);
  const starts = groupRadarNades(entries, "from", nuke, calibration);
  assert.deepEqual(starts.map(group => group.nades.length), [2, 1]);
  assert.deepEqual(starts.map(group => group.point.level), ["upper", "lower"]);
  const targets = groupRadarNades(entries, "to", nuke, calibration);
  assert.equal(targets.length, 2);
  assert.equal(targets.flatMap(group => group.nades).length, 3);
});

test("Nuke outside wall keeps successive smoke targets separate while retaining variants at the same target", () => {
  const nuke = ACTIVE_DUTY_MAPS.find(map => map.key === "nuke")!;
  const entries = [
    { name: "wall1", landingPos: "650 -1500 -400" },
    { name: "wall1variant", landingPos: "662 -1512 -400" },
    { name: "wall2", landingPos: "790 -1640 -400" },
    { name: "wall3", landingPos: "930 -1780 -400" },
  ].map(entry => ({ ...entry, owner: "player", map: "de_nuke", type: "Smoke", lineupPos: "0 -1500 -400" }));
  const calibration = inferRadarCalibration(nuke, entries);
  const targets = groupRadarNades(entries, "to", nuke, calibration);
  assert.deepEqual(targets.map(group => group.nades.map(nade => nade.name)), [["wall1", "wall1variant"], ["wall2"], ["wall3"]]);
  assert.deepEqual(targets, groupRadarNades([...entries].reverse(), "to", nuke, calibration));
  assert.equal(groupRadarNades(entries, "from", nuke, calibration).length, 1);
  assert.deepEqual(groupRadarNades(targets[0].nades, "to", nuke, calibration)[0].point, targets[0].point);
});

test("target grouping accounts for image aspect ratio and never absorbs a chain of adjacent targets", () => {
  const entries = [nade("a", undefined, { x: .1, y: .1 }), nade("b", undefined, { x: .109, y: .1 }), nade("c", undefined, { x: .118, y: .1 })];
  assert.deepEqual(groupRadarNades(entries, "to", map, null).map(group => group.nades.length), [2, 1]);
  const wide = { ...map, radarWidth: 2000, radarHeight: 1000 };
  assert.equal(groupRadarNades([nade("a", undefined, { x: .1, y: .1 }), nade("b", undefined, { x: .1, y: .118 })], "to", wide, null).length, 1);
  assert.equal(groupRadarNades([nade("a", undefined, { x: .1, y: .1 }), nade("b", undefined, { x: .1, y: .123 })], "to", wide, null).length, 2);
});

test("targets group first, then identical starts retain every individual lineup", () => {
  const nades = [nade("a"), nade("b"), nade("c", { x: 0.5, y: 0.8 }), nade("d", undefined, { x: 0.1, y: 0.9 })];
  const targets = groupRadarNades(nades, "to", map, null);
  assert.deepEqual(targets.map(g => g.nades.length), [3, 1]);
  const selected = findRadarGroup(targets, lineupId(nades[1]))!;
  const starts = groupRadarNades(selected.nades, "from", map, null);
  assert.deepEqual(starts.map(g => g.nades.map(n => n.name)), [["a", "b"], ["c"]]);
  const reverse = groupRadarNades(nades, "from", map, null);
  const destinations = groupRadarNades(findRadarGroup(reverse, lineupId(nades[0]))!.nades, "to", map, null);
  assert.deepEqual(destinations.map(g => g.nades.length), [2, 1]);
});

test("grouping is stable across input order and keeps owners with the same name distinct", () => {
  const entries = [nade("same"), { ...nade("same"), owner: "other" }, nade("far", { x: 0.9, y: 0.9 })];
  const groups = groupRadarNades(entries, "from", map, null);
  assert.deepEqual(groups, groupRadarNades([...entries].reverse(), "from", map, null));
  assert.equal(groups.find(g => g.nades.length === 2)?.nades.length, 2);
  assert.notEqual(lineupId(entries[0]), lineupId(entries[1]));
  assert.equal(findRadarGroup(groups, "stale-id"), undefined);
  assert.equal(findRadarGroup(groups, null), undefined);
});

test("nearby points stack without collapsing a chain of distant positions", () => {
  const entries = [nade("a", { x: 0.1, y: 0.1 }), nade("b", { x: 0.13, y: 0.1 }), nade("c", { x: 0.16, y: 0.1 })];
  assert.deepEqual(groupRadarNades(entries, "from", map, null).map(g => g.nades.length), [2, 1]);
  const wide = { ...map, radarWidth: 2000, radarHeight: 1000 };
  assert.equal(groupRadarNades([nade("a", { x: 0.1, y: 0.1 }), nade("b", { x: 0.1, y: 0.16 })], "from", wide, null).length, 1);
});

test("missing and invalid positions are omitted only from the relevant side; calibration works", () => {
  const entries = [{ ...nade("partial"), radarTo: null }, { ...nade("invalid"), radarFrom: { x: 2, y: 0 } }];
  assert.deepEqual(groupRadarNades(entries, "to", map, null).flatMap(g => g.nades.map(n => n.name)), ["invalid"]);
  assert.deepEqual(groupRadarNades(entries, "from", map, null).flatMap(g => g.nades.map(n => n.name)), ["partial"]);
  const calibration = { xScale: 0.001, xOffset: 0.5, yScale: -0.001, yOffset: 0.5 };
  const projected = { ...nade("world"), radarFrom: null, lineupPos: "0 0 0" };
  assert.deepEqual(groupRadarNades([projected], "from", map, calibration)[0].point, { x: 0.5, y: 0.5 });
  assert.equal(groupRadarNades([projected], "from", map, null).length, 0);
  assert.deepEqual(groupRadarNades([], "to", map, null), []);
});
