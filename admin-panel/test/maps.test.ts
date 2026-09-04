import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_DUTY_MAPS,
  addWorkshopMap,
  extractWorkshopId,
  mapMatchesNade,
  parseWorkshopIds,
  removeWorkshopMap,
  workshopMapsFromSettings
} from "../client/src/lib/maps.js";

test("active duty catalog follows Valve Season Five", () => {
  assert.deepEqual(ACTIVE_DUTY_MAPS.map((map) => map.mapName), [
    "de_mirage",
    "de_dust2",
    "de_nuke",
    "de_inferno",
    "de_ancient",
    "de_anubis",
    "de_cache"
  ]);
});

test("workshop parser accepts IDs and Steam item links", () => {
  assert.equal(extractWorkshopId("3070244462"), "3070244462");
  assert.equal(extractWorkshopId("https://steamcommunity.com/sharedfiles/filedetails/?id=3077265396"), "3077265396");
  assert.deepEqual(parseWorkshopIds("3070244462, 3070244462\nhttps://steamcommunity.com/sharedfiles/filedetails/?id=3077265396"), ["3070244462", "3077265396"]);
});

test("workshop metadata stays paired with the server addon list", () => {
  const added = addWorkshopMap({}, {
    title: "Aim Botz",
    mapName: "aim_botz",
    workshopId: "https://steamcommunity.com/sharedfiles/filedetails/?id=3070244462"
  });
  assert.deepEqual(workshopMapsFromSettings(added).map((map) => ({ name: map.name, mapName: map.mapName, workshopId: map.workshopId })), [{
    name: "Aim Botz",
    mapName: "aim_botz",
    workshopId: "3070244462"
  }]);
  assert.deepEqual(workshopMapsFromSettings({ ...added, ...removeWorkshopMap(added, "3070244462") }), []);
});

test("map matching tolerates display names and engine prefixes", () => {
  assert.equal(mapMatchesNade(ACTIVE_DUTY_MAPS[1], "Dust 2"), true);
  assert.equal(mapMatchesNade(ACTIVE_DUTY_MAPS[1], "de_dust2"), true);
  assert.equal(mapMatchesNade(ACTIVE_DUTY_MAPS[1], "de_mirage"), false);
});
