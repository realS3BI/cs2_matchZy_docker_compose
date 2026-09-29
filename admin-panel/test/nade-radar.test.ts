import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_DUTY_MAPS } from "../client/src/lib/maps.js";
import { inferRadarCalibration, resolveRadarPoints, worldToRadar } from "../client/src/lib/nade-radar.js";

const map = ACTIVE_DUTY_MAPS[0];
const references = [
  { map: map.mapName, lineupPos: "-1000 1000 0", radarFrom: { x: 0.1, y: 0.2 } },
  { map: map.mapName, lineupPos: "1000 -1000 128", radarFrom: { x: 0.9, y: 0.8 } }
];

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
  assert.equal(inferRadarCalibration(ACTIVE_DUTY_MAPS[1], references), null);
  assert.equal(inferRadarCalibration(map, [references[0], { ...references[1], lineupPos: "-999 0 0" }]), null);
  assert.equal(inferRadarCalibration(map, [...references, { map: map.mapName, lineupPos: "0 0 0", radarFrom: { x: 0.2, y: 0.5 } }]), null);
  assert.equal(inferRadarCalibration(ACTIVE_DUTY_MAPS[2], references.map(n => ({ ...n, map: "de_nuke" }))), null);
});
