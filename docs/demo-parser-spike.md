# Praktischer Versuch mit demoparser2

Stand: 5. Oktober 2026. Getestet wurde `@laihoe/demoparser2@0.42.0`, zum Abrufzeitpunkt die aktuelle npm-Version. Experimente und Ergebnisse liegen ausschließlich in `/tmp/cs2-demo-parser-spike.JxdHvY`. Es wurden keine Accounts oder privaten Demos verwendet. [npm-Paket](https://www.npmjs.com/package/@laihoe/demoparser2)

## Testdatei und Plattformen

Die echte CS2-Testdemo stammt aus dem offiziellen Parser-Repository, fest auf Commit `c8f79275f30132696abaa22796f7234300b005af` bezogen. Sie liegt lokal als `/tmp/cs2-demo-parser-spike.JxdHvY/test_demo.dem` und enthält ein Valve-Match auf Mirage. Dateigröße: 60.601.900 Bytes. SHA-256: `84a1a4191302bdd2a3bbb5a727842093744b1fb1a228aeec630369e44b622cb2`. [Testdemo](https://github.com/LaihoE/demoparser/blob/c8f79275f30132696abaa22796f7234300b005af/src/parser/test_demo.dem)

| Umgebung | Ergebnis |
| --- | --- |
| macOS arm64, Node 24.14.0 | Installation und sämtliche unten genannten Aufrufe erfolgreich. |
| Docker `node:24-alpine`, Alpine 3.24.2, Linux arm64, Node 24.21.0 | Installation, `parseHeader` und `parseTicks` erfolgreich. Das native Paket `@laihoe/demoparser2-linux-arm64-musl@0.42.0` wurde geladen. |
| macOS x64 sowie Linux x64 mit musl | Passende optionale native Pakete sind in npm veröffentlicht. In diesem Versuch nicht ausgeführt. |

Alpine benötigt somit für die getestete arm64-Konfiguration keinen eigenen Rust-Build. Native Abhängigkeiten jeweils innerhalb der Zielplattform installieren; zwischen macOS und Linux dürfen keine installierten `node_modules` geteilt werden. Das Paket verteilt plattformspezifische optionale Abhängigkeiten. [Paketmanifest](https://github.com/LaihoE/demoparser/blob/main/src/node/package.json)

## Tatsächlich beobachtete API-Formen

Die installierte `index.d.ts` deklariert die Ergebnisse überwiegend als `any`. Die folgenden Ausschnitte stammen aus echten Aufrufen; ausgelassene Felder sind jeweils gekennzeichnet. [TypeScript-Schnittstelle](https://github.com/LaihoE/demoparser/blob/main/src/node/index.d.ts)

`parseHeader(path)` liefert ein Objekt. Hier ein Ausschnitt:

```json
{
  "client_name": "SourceTV Demo",
  "demo_file_stamp": "PBDEMS2\u0000",
  "map_name": "de_mirage",
  "patch_version": "13984"
}
```

Tickrate, Dauer und Matchdatum waren darin nicht enthalten. `patch_version` ist ein String.

```js
parseEvents(path, eventNames, ["X", "Y", "Z"],
  ["total_rounds_played", "is_warmup_period"])
```

liefert ein flaches Array. Der Typ steht in `event_name`. Ein vollständiges Rundenereignis:

```json
{
  "event_name": "round_freeze_end",
  "is_warmup_period": false,
  "tick": 10699,
  "total_rounds_played": 1
}
```

| Ereignis | Anzahl in der Testdemo |
| --- | ---: |
| `round_start` | 10 |
| `round_freeze_end` | 9 |
| `round_end` | 10 |
| `player_death` | 73 |
| `smokegrenade_detonate` | 40 |
| `smokegrenade_expired` | 38 |
| `inferno_startburn` | 25 |
| `inferno_expire` | 25 |
| `bomb_planted` | 7 |
| `bomb_defused` | 1 |
| `bomb_exploded` | 2 |

Bei Kills heißen die Beteiligten `user_steamid` für das Opfer, `attacker_steamid` und `assister_steamid`. Steam-IDs sind Strings; ein fehlender Assister ist `null`. Zusätzliche Positionen erscheinen etwa als `attacker_X`. Utility-Ereignisse enthalten `entityid`, `x`, `y`, `z` und die Werferzuordnung `user_steamid`. Diese Positionen am Ereigniszeitpunkt sind noch keine vollständige Wurfanleitung. Bombenereignisse verwenden hier numerische `site`-Werte `184` und `185`; sie sind keine fertigen A/B-Bezeichnungen.

```js
parseTicks(path,
  ["X", "Y", "Z", "yaw", "health", "team_num", "active_weapon",
   "total_rounds_played", "is_warmup_period"],
  [10000])
```

liefert zehn Spielerobjekte. Ein vollständiges Beispiel:

```json
{
  "X": 1296,
  "Y": -256,
  "Z": -167.96875,
  "active_weapon": 5439588,
  "health": 100,
  "is_warmup_period": false,
  "name": "123",
  "steamid": "76561198265366770",
  "team_num": 2,
  "tick": 10000,
  "total_rounds_played": 1,
  "yaw": -120.84617614746094
}
```

`active_weapon` ist ein numerischer Entity-Handle. `active_weapon_name` oder `weapon_name` liefert Namen wie `Smoke Grenade`, `Desert Eagle` und `knife_t`. Diese Namen sind nicht einheitlich als technische Waffen-ID formatiert. `is_alive`, `pitch`, `is_freeze_period`, `round_start_time` und `game_time` wurden ebenfalls erfolgreich abgefragt.

`wantedTicks` ist eine Liste konkreter Demoticks. Nicht vorhandene Samples entfallen; der angefragte Tick `0` lieferte hier keine Zeile. Mit dem fünften Argument `true` gibt `parseTicks` stattdessen ein Objekt mit Spaltenarrays zurück. `parsePlayerInfo` verwendet `team_number`, Tickdaten dagegen `team_num`.

Unbekannte Tickfelder erzeugen nicht zuverlässig einen Fehler: `does_not_exist` wurde still ausgelassen, während `name`, `steamid` und `tick` zurückkamen. Erforderliche Ergebnisfelder müssen nach dem Parsen geprüft werden.

`parseGrenades(path, [], false)` liefert ebenfalls ein flaches Array, hier ein vollständiges Element:

```json
{
  "grenade_entity_id": 207,
  "grenade_type": "CSmokeGrenadeProjectile",
  "name": "-ExΩtiC-",
  "steamid": "76561198258044111",
  "tick": 1,
  "x": -1571.4375,
  "y": -2146.59375,
  "z": -253.84375
}
```

Jede Zeile ist ein Positionssample, kein einzelner Wurf. Das dritte Argument `false` schließt Nicht-Projektil-Granaten aus; der Standardwert ist `true`. Spielerkoordinaten haben große, Granatenkoordinaten kleine Achsenbuchstaben. [Implementierung](https://github.com/LaihoE/demoparser/blob/main/src/node/src/lib.rs)

## Rundenbildung und Zeitbasis

- Die erste spielbare Runde beginnt bei Tick `65`. Ihr `round_start` trägt noch `is_warmup_period: true`, der Tick-Snapshot desselben Ticks bereits `false`. `round_freeze_end` folgt bei `1761`. Wer Rundenstarts allein nach dem Warmup-Flag filtert, verliert diese Runde.
- Bei `round_end` an Tick `8971` ist `total_rounds_played` im Ereignis `0`, im Tick-Snapshot bereits `1`. Ereignisreihenfolge und eindeutig abgegrenzte Tickintervalle müssen die Zuordnung bestimmen; den Zähler nicht allein als Join-Schlüssel verwenden.
- Neun Runden haben ein Freeze-Ende. Die zehnte endet ohne Freeze-Ende durch Aufgabe, `reason: 18`. Sie darf weder einen erfundenen Spielstart erhalten noch stillschweigend als normales Gefecht erscheinen.
- `round_officially_ended` liegt hier jeweils am nächsten `round_start`. `round_end` ist davor und bezeichnet die Entscheidung der Runde. Nachlaufzeit und eigentliches Spielgeschehen getrennt behandeln.
- `game_time` hat einen anderen Ursprung als der Demotick. Bei Tick `1761` beträgt es `97.265625`. Der eingesehene Rust-Code berechnet diesen Wert ausdrücklich als `net_tick / 64.0`; daraus kann keine unabhängig erkannte Tickrate abgeleitet werden. [Zeitberechnung](https://github.com/LaihoE/demoparser/blob/main/src/parser/src/second_pass/collect_data.rs)

Für diesen Prototyp sind 64 Ticks pro Sekunde eine offen ausgewiesene Quellenannahme. Die Rundenzeit wird relativ zum zugeordneten Freeze-Ende berechnet. Ein allgemeiner Import darf die Annahme nicht als gemessene Headerinformation ausgeben. Die Demo belegt keine korrekte Behandlung von Seitenwechseln, Verlängerung oder neueren FACEIT-Aufzeichnungen.

## Messungen und Entscheidung

Einzelmessungen auf macOS; kein belastbarer Durchsatzbenchmark. Die Messskripte serialisieren die vollständigen Ergebnisse und schreiben sie nach `/tmp`. Spitzenverbrauch enthält daher Parser, JS-Objekte und Serialisierung. MB sind dezimal.

| Aufruf | Zeit | Ergebnis | Speicher |
| --- | --- | --- | --- |
| `parseHeader` | unter 1 ms | 447 Bytes JSON | nicht isoliert gemessen |
| `parseEvents`, elf Typen | 77 ms einschließlich JSON/Schreiben | 240 Ereignisse, 0,108 MB JSON | nicht isoliert gemessen |
| `parseTicks`, jedes achte Tick | 363 ms reine Parsezeit; 0,65 s gesamter Prozess | 71.110 Spielerzeilen, 17,87 MB JSON, 1,30 MB gzip | 570 MB maximaler RSS |
| `parseGrenades(..., [], false)` | 323 ms reine Parsezeit; 0,77 s gesamter Prozess | 87.405 Zeilen, 15,18 MB JSON, 0,55 MB gzip | 467 MB maximaler RSS |
| `parseGrenades` mit Standardoptionen | 1,71 s einschließlich JSON/Schreiben | 517.048 Zeilen, 78,46 MB JSON | Gesamtversuch mit vorherigen Aufrufen: 1.426 MB maximaler RSS |

Empfehlung: Version `0.42.0` festlegen, im getrennten Worker parsen, Tickdaten gezielt abtasten und für Projektilbahnen das dritte Argument `false` setzen. Ereignisse für Beginn und Ende von Smoke/Inferno separat verarbeiten; die Anzahl von Beginn- und Endereignissen muss nicht übereinstimmen. Rohdaten nicht vollständig an den Browser schicken. Abgeleitete Runden und reduzierte Wiedergabedaten benötigen eigene Schemaprüfungen.

Reproduktionsdateien im Tempverzeichnis: `inspect.cjs`, `inspect-output.jsonl`, `events.json`, `ticks-time.json`, `grenades-lite.cjs`, `grenades-lite-output.json`, `ticks-sampled.cjs`, `ticks-8hz-output.json` und `alpine-output.json`. Die zugehörigen `*-resource.txt` enthalten die Ausgabe von `/usr/bin/time -l`.
