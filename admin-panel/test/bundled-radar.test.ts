import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILT_IN_MAPS } from "../client/src/lib/maps.js";
import { inferRadarCalibration, resolveRadarPoints, worldToRadar } from "../client/src/lib/nade-radar.js";
import { groupRadarNades } from "../client/src/lib/radar-groups.js";
import { RADAR_CALIBRATION_EVIDENCE } from "./radar-calibration-evidence.js";

for (const evidence of RADAR_CALIBRATION_EVIDENCE) {
  test(`${evidence.mapName}: captured coordinates match registered image landmarks and manual markers stay local`, () => {
    const map = BUILT_IN_MAPS.find(map => map.mapName === evidence.mapName)!;
    const calibration = inferRadarCalibration(map, []);
    assert.ok(calibration);
    const assetHash = (url: string) => createHash("sha256").update(readFileSync(resolve("client/public", url.slice(1)))).digest("hex");
    assert.equal(assetHash(evidence.radarUrl), evidence.imageSha256, "calibration must match the actual bundled image");
    const split = calibration.altitudeSplit;
    const samples: { points: readonly { world: readonly number[]; pixel: readonly number[] }[]; height: number; level: string }[] =
      [{ points: evidence.samples, height: split === undefined ? 0 : split + 1, level: "upper" }];
    if ("lowerSamples" in evidence) samples.push({ points: evidence.lowerSamples, height: split! - 1, level: "lower" });
    if ("radarLowerUrl" in evidence) assert.equal(assetHash(evidence.radarLowerUrl), evidence.lowerImageSha256);
    for (const { points, height, level } of samples) {
      for (const sample of points) {
        const pos = `${sample.world[0]} ${sample.world[1]} ${height}`;
        const point = worldToRadar(pos, calibration);
        assert.ok(point, "matched landmark must be visible");
        assert.ok(Math.abs(point.x * map.radarWidth! - sample.pixel[0]) <= 4.01);
        assert.ok(Math.abs(point.y * map.radarHeight! - sample.pixel[1]) <= 4.01);
        if (split !== undefined) assert.equal(point.level, level);
        const capture = { owner: "123", map: map.mapName, name: "new", lineupPos: pos, landingPos: pos };
        const manual = { ...capture, name: "old", radarFrom: { x: .1, y: .9 }, radarTo: { x: .8, y: .2 }, official: true };
        const withReferences = inferRadarCalibration(map, [manual, capture]);
        assert.deepEqual(withReferences, calibration);
        assert.deepEqual(resolveRadarPoints(manual, calibration).radarFrom, { ...manual.radarFrom, ...(split !== undefined && { level }) });
        for (const side of ["from", "to"] as const) {
          assert.ok(groupRadarNades([manual, capture], side, map, withReferences)
            .some(group => group.nades.some(nade => nade.name === "new")));
        }
      }
    }
    assert.equal(inferRadarCalibration({ ...map, radarUrl: "/custom.png" }, []), null);
    assert.equal(inferRadarCalibration({ ...map, radarWidth: map.radarWidth! + 1 }, []), null);
    assert.equal(worldToRadar("", calibration), null);
    assert.equal(worldToRadar("1 NaN 0", calibration), null);
  });
}

test("all built-in maps have either fixed calibration, reference calibration, or no radar", () => {
  const needsReferences = ["cs_agency", "de_grail", "de_jura", "de_thera", "de_mills", "de_contact"];
  for (const map of BUILT_IN_MAPS) {
    const calibration = inferRadarCalibration(map, []);
    if (!map.radarUrl) {
      assert.equal(map.mapName, "ar_pool_day");
      assert.equal(calibration, null);
    } else if (needsReferences.includes(map.mapName)) {
      assert.equal(calibration, null);
      // One saved lineup can provide both references if its endpoints are far enough apart.
      const reference = { map: map.mapName, lineupPos: "-1000 1000 0", landingPos: "1000 -1000 0",
        radarFrom: { x: .2, y: .2 }, radarTo: { x: .8, y: .8 } };
      const calibrated = inferRadarCalibration(map, [reference]);
      assert.ok(calibrated, map.mapName);
      assert.deepEqual(worldToRadar("0 0 0", calibrated), { x: .5, y: .5 });
      assert.equal(inferRadarCalibration(map, [{ ...reference, landingPos: "-950 950 0" }]), null);
    } else {
      assert.ok(calibration, `${map.mapName} must project without manual references`);
    }
  }
});
