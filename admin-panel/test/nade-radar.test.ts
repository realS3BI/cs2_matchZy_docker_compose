import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_DUTY_MAPS } from "../client/src/lib/maps.js";
import { inferRadarCalibration, resolveRadarPoints, worldToRadar } from "../client/src/lib/nade-radar.js";
import { radarCanvasSize, radarPointVisible, radarInputPoint } from "../client/src/lib/radar-layout.js";
import { groupRadarNades } from "../client/src/lib/radar-groups.js";

// Custom images still calibrate from saved references rather than bundled transforms.
const map = { ...ACTIVE_DUTY_MAPS[0], radarUrl: "/custom-mirage.webp" };
const references = [
  { map: map.mapName, lineupPos: "-1000 1000 0", radarFrom: { x: 0.1, y: 0.2 } },
  { map: map.mapName, lineupPos: "1000 -1000 128", radarFrom: { x: 0.9, y: 0.8 } }
];

test("Anubis projects captured smoke endpoints without prior manual references", () => {
  const anubis = ACTIVE_DUTY_MAPS.find(map => map.mapName === "de_anubis")!;
  const calibration = inferRadarCalibration(anubis, []);
  assert.ok(calibration);
  const points = resolveRadarPoints({ lineupPos: "-400 2192 32", landingPos: "-100 1200 96" }, calibration);
  assert.ok(Math.abs(points.radarFrom!.x - .442) < .002);
  assert.ok(Math.abs(points.radarFrom!.y - .208) < .002);
  assert.ok(points.radarTo);
  assert.equal(inferRadarCalibration({ ...anubis, radarUrl: "/custom-anubis.webp" }, []), null);
  assert.equal(inferRadarCalibration({ ...anubis, radarWidth: 1024 }, []), null);
  assert.equal(resolveRadarPoints({ landingPos: "-100 1200 900" }, calibration).radarTo!.x, points.radarTo.x);
});

test("saved Anubis markers cannot disable or distort automatic positions for new captures", () => {
  const anubis = ACTIVE_DUTY_MAPS.find(map => map.mapName === "de_anubis")!;
  const baseline = inferRadarCalibration(anubis, []);
  const capture = { owner: "123", name: "new-smoke", map: "de_anubis",
    lineupPos: "-400 2192 32", landingPos: "-100 1200 96" };
  for (const target of ["-350 2150 96", "-100 1200 96"]) {
    const saved = { owner: "123", name: "saved-smoke", map: "de_anubis",
      lineupPos: "-400 2192 32", landingPos: target,
      radarFrom: { x: .25, y: .3 }, radarTo: { x: .75, y: .8 } };
    const calibration = inferRadarCalibration(anubis, [saved, capture]);
    assert.deepEqual(calibration, baseline);
    assert.deepEqual(resolveRadarPoints(capture, calibration), resolveRadarPoints(capture, baseline));
    assert.deepEqual(resolveRadarPoints(saved, calibration), { radarFrom: saved.radarFrom, radarTo: saved.radarTo });
    for (const side of ["from", "to"] as const) {
      assert.ok(groupRadarNades([saved, capture], side, anubis, calibration)
        .some(group => group.nades.some(nade => nade.name === capture.name)));
    }
  }
});

test("saved map references project world start and airborne effect coordinates", () => {
  const calibration = inferRadarCalibration(map, references);
  assert.ok(calibration);
  const points = resolveRadarPoints({ lineupPos: "0 0 0", landingPos: "500 -500 700" }, calibration);
  assert.deepEqual(points.radarFrom, { x: 0.5, y: 0.5 });
  assert.equal(points.radarTo?.x, 0.7);
  assert.ok(Math.abs(points.radarTo!.y - 0.65) < 0.00001);
  assert.equal(worldToRadar("10000 0 0", calibration), null);
  assert.equal(worldToRadar("NaN 0 0", calibration), null);
  assert.equal(worldToRadar("", calibration), null);
});

test("manual markers override projection without inventing an unknown target", () => {
  const manual = { x: 0.25, y: 0.3 };
  const points = resolveRadarPoints({ lineupPos: "0 0 0", radarFrom: manual }, inferRadarCalibration(map, references));
  assert.deepEqual(points, { radarFrom: manual, radarTo: null });
});

test("missing, narrow, inconsistent and wrong-map references cannot calibrate a map", () => {
  assert.equal(inferRadarCalibration(map, []), null);
  assert.equal(inferRadarCalibration(map, references.slice(0, 1)), null);
  assert.equal(inferRadarCalibration({ ...ACTIVE_DUTY_MAPS[1], radarUrl: "/custom-dust2.webp" }, references), null);
  assert.equal(inferRadarCalibration(map, [references[0], { ...references[1], lineupPos: "-999 0 0" }]), null);
  assert.equal(inferRadarCalibration(map, [...references, { map: map.mapName, lineupPos: "0 0 0", radarFrom: { x: 0.2, y: 0.5 } }]), null);
  assert.equal(inferRadarCalibration({ ...ACTIVE_DUTY_MAPS[2], radarUrl: "/custom-nuke.webp" }, references.map(n => ({ ...n, map: "de_nuke" }))), null);
});

const nuke = ACTIVE_DUTY_MAPS.find(map => map.mapName === "de_nuke")!;

test("Nuke projects upper and lower endpoints without references, choosing each endpoint's own altitude", () => {
  const calibration = inferRadarCalibration(nuke, []);
  assert.ok(calibration);
  const points = resolveRadarPoints({ lineupPos: "650 -700 -400", landingPos: "650 -1100 -768" }, calibration);
  assert.equal(points.radarFrom!.level, "upper");
  assert.equal(points.radarTo!.level, "lower");
  // Independent landmarks: centre of A on the upper image; B on the lower image.
  assert.ok(Math.abs(points.radarFrom!.x * 1558 - 870) < 5);
  assert.ok(Math.abs(points.radarFrom!.y * 848 - 404) < 5);
  assert.ok(Math.abs(points.radarTo!.x * 1558 - 875) < 5);
  assert.ok(Math.abs(points.radarTo!.y * 848 - 496) < 5);
  assert.equal(worldToRadar("650 -700 -495", calibration)!.level, "upper");
  assert.equal(worldToRadar("650 -700 -495.001", calibration)!.level, "lower");
  assert.equal(worldToRadar("650 -700 900", calibration)!.level, "upper");
  assert.equal(worldToRadar("650 -700", calibration), null);
  assert.equal(worldToRadar("650 -700 NaN", calibration), null);
  assert.equal(worldToRadar("100000 -700 -768", calibration), null);
  assert.equal(inferRadarCalibration({ ...nuke, radarLowerUrl: undefined }, []), null);
  assert.equal(inferRadarCalibration({ ...nuke, radarHeight: 1024 }, []), null);
});

test("Nuke preserves legacy manual XY, allows explicit floor correction and does not invent a missing endpoint", () => {
  const calibration = inferRadarCalibration(nuke, []);
  const legacy = { x: .3, y: .6 };
  assert.deepEqual(resolveRadarPoints({ lineupPos: "650 -1100 -768", radarFrom: legacy }, calibration),
    { radarFrom: { ...legacy, level: "lower" }, radarTo: null });
  const corrected = { ...legacy, level: "upper" as const };
  assert.deepEqual(resolveRadarPoints({ lineupPos: "650 -1100 -768", radarFrom: corrected }, calibration).radarFrom, corrected);
  assert.deepEqual(resolveRadarPoints({ radarFrom: legacy }, calibration).radarFrom, legacy);
});

test("Nuke switches between full-size images, filters by level and preserves local click coordinates", () => {
  assert.deepEqual(radarCanvasSize(nuke), { width: 1558, height: 848 });
  for (const level of ["upper", "lower"] as const) {
    for (const x of [.1, .6, .9]) {
      const point = { x, y: .4, level };
      assert.equal(radarPointVisible(nuke, point, level), true);
      assert.equal(radarPointVisible(nuke, point, level === "upper" ? "lower" : "upper"), false);
      assert.deepEqual(radarInputPoint(nuke, { x, y: .4 }, level), point);
    }
  }
  assert.deepEqual(radarInputPoint(nuke, { x: 1, y: 1 }, "lower"), { x: 1, y: 1, level: "lower" });
  assert.deepEqual(radarInputPoint(map, { x: .2, y: .3 }, "upper"), { x: .2, y: .3 });
  assert.equal(radarPointVisible(nuke, { x: .2, y: .3 }, "upper"), true);
  assert.equal(radarPointVisible(nuke, { x: .2, y: .3 }, "lower"), false);
  assert.equal(radarPointVisible(map, { x: .2, y: .3 }, "lower"), true);
});

test("corrected references move automatic positions while preserving manual overrides across nade types", () => {
  const corrected = references.map(nade => ({ ...nade, radarFrom: { x: nade.radarFrom.x * .8 + .1, y: nade.radarFrom.y } }));
  const before = inferRadarCalibration(map, references);
  const after = inferRadarCalibration(map, corrected);
  assert.ok(after);
  for (const type of ["Smoke", "Molly", "Flash", "HE", "Decoy"]) {
    const nade = { type, lineupPos: "500 -500 0", landingPos: "-500 500 0" };
    assert.ok(Math.abs(resolveRadarPoints(nade, before).radarFrom!.x - .7) < .00001);
    assert.ok(Math.abs(resolveRadarPoints(nade, after).radarFrom!.x - .66) < .00001);
    const manual = { x: .3, y: .7 };
    assert.deepEqual(resolveRadarPoints({ ...nade, radarFrom: manual }, after).radarFrom, manual);
  }
});
