# CS2 + MatchZy fuer Docker Compose und Coolify

Dieses Repository liefert einen bewusst kleinen Stack:

- CS2 Dedicated Server auf Basis von `cm2network/cs2`
- automatischen Mod-Install beim Serverstart
- `Metamod Source 2.0-dev`
- `MatchZy` inklusive `CounterStrikeSharp`, sofern das passende MatchZy-Release verfuegbar ist
- `cs2-fake-rcon`
- `WeaponPaints`
- `CS2-SimpleAdmin` inklusive `PlayerSettingsCS2`, `AnyBaseLibCS2` und `MenuManagerCS2`
- `FortniteEmotesNDances` inklusive `MultiAddonManager` und `Ray-Trace`
- `cs2-executes`
- `RollTheDice`

Aktuell ist absichtlich kein Web-Panel enthalten. Der Fokus liegt auf einem stabilen `MatchZy`-Server fuer Pracc, Pugs, Scrims und spaeter erweiterbare Automatisierung.

## Enthaltene Dateien

- `docker-compose.yml`
- `cs2/Dockerfile`
- `cs2/pre.sh`
- `.env.example`
- `README.md`

## 1) Vorbereitung

1. `.env.example` nach `.env` kopieren.
2. Mindestens diese Werte setzen:
   - `SRCDS_TOKEN`
   - `CS2_RCONPW`
3. Optional anpassen:
   - `CS2_SERVERNAME`
   - `CS2_PW`
   - `CS2_STARTMAP`
   - `CS2_MAXPLAYERS`
   - `METAMOD_VERSION`
   - `MATCHZY_VERSION`
   - `FAKE_RCON_ENABLED`
   - `WEAPONPAINTS_ENABLED`
   - `FORTNITE_EMOTES_ENABLED`
   - `EXECUTES_ENABLED`
   - `ROLLTHEDICE_ENABLED`
   - `SIMPLEADMIN_ENABLED`
   - `ADMINS`

## 2) Deploy mit Docker Compose oder Coolify

1. Repository als Compose-Ressource in Coolify verbinden oder lokal mit `docker compose` nutzen.
2. `docker-compose.yml` deployen.
3. Die Environment-Variablen aus `.env` in Coolify setzen.
4. Nur die Spielports freigeben:
   - `27015/tcp`
   - `27015/udp`
   - `27020/udp`

Hinweis: Es werden keine custom networks und keine Host-Bind-Mounts benoetigt. Das ist fuer Coolify robuster.

## 3) Was der Stack macht

### Ports

- `27015` -> CS2 Game (`tcp/udp`)
- `27020` -> CS TV (`udp`, reserviert)

### Startverhalten

`cs2/pre.sh` wird vor dem Start des CS2-Prozesses ausgefuehrt und erledigt Folgendes:

1. Loest Metamod fuer CS2 ueber die offiziellen `2.0-dev` Builds auf.
2. Loest das gewuenschte MatchZy-Release auf.
3. Installiert optional weitere Plugins ueber deren offizielle Release-Archive:
   - `cs2-fake-rcon`
   - `WeaponPaints`
   - `CS2-SimpleAdmin`
   - `PlayerSettingsCS2`
   - `AnyBaseLibCS2`
   - `MenuManagerCS2`
   - `MultiAddonManager`
   - `Ray-Trace`
   - `FortniteEmotesNDances`
   - `cs2-executes`
   - `RollTheDice`
4. Schreibt `cfg/MatchZy/admins.json` aus `ADMINS` neu.
5. Patcht `gameinfo.gi` erneut, damit `csgo/addons/metamod` in den `SearchPaths` enthalten ist.
6. Speichert die installierten Versionen in `/home/steam/cs2-dedicated/.mod-installer/state.env`.

## 4) Zusatzplugins

### cs2-fake-rcon

- Wird standardmaessig installiert.
- Stellt `fake_rcon_password` und `fake_rcon` bereit.

### WeaponPaints

- Wird standardmaessig installiert.
- Benoetigt MySQL laut Projekt-Doku.
- `cs2/pre.sh` kopiert automatisch `weaponpaints.json` nach `addons/counterstrikesharp/gamedata/`.
- `cs2/pre.sh` setzt in `addons/counterstrikesharp/configs/core.json` nach Moeglichkeit `FollowCS2ServerGuidelines` auf `false`, wie vom Projekt verlangt.
- Danach musst du `addons/counterstrikesharp/configs/plugins/WeaponPaints/WeaponPaints.json` mit deinen DB-Daten pflegen.

### CS2-SimpleAdmin

- Wird standardmaessig installiert.
- Abhaengigkeiten `PlayerSettingsCS2`, `AnyBaseLibCS2` und `MenuManagerCS2` werden automatisch mit installiert.
- Beim ersten Start erzeugt das Plugin seine Konfiguration unter:

```text
addons/counterstrikesharp/configs/plugins/CS2-SimpleAdmin/CS2-SimpleAdmin.json
```

### FortniteEmotesNDances

- Wird standardmaessig installiert.
- Benoetigt laut Projekt `MultiAddonManager` und `Ray-Trace`; beides wird automatisch mit installiert.
- `cs2/pre.sh` traegt automatisch die Workshop-Addon-ID `3328582199` in `cfg/multiaddonmanager/multiaddonmanager.cfg` ein.
- Wenn du das Plugin nicht willst, setze `FORTNITE_EMOTES_ENABLED=0`.

### cs2-executes

- Wird standardmaessig installiert.
- Das Plugin ist eher ein eigener Trainings-/Executes-Modus als ein klassisches Scrim-Plugin.
- Wenn du nur MatchZy fuer Pracc/Scrims willst, kannst du es ueber `EXECUTES_ENABLED=0` deaktivieren.

### RollTheDice

- Wird standardmaessig installiert.
- Das Plugin ist ein Fun-/Chaos-Modus und normalerweise nichts fuer ernsthafte Scrims.
- Wenn du es nicht willst, setze `ROLLTHEDICE_ENABLED=0`.

## 5) Erste Nutzung mit MatchZy

Nach erfolgreichem Start kannst du MatchZy direkt im Server verwenden.

Wenn du MatchZy-Admins per Environment setzen willst, nutze `ADMINS` als komma-separierte Liste von Steam64IDs. Leerzeichen um die Kommata sind erlaubt.

```bash
ADMINS=76561198000000001, 76561198000000002
```

Beim Containerstart schreibt `cs2/pre.sh` daraus die Datei `game/csgo/cfg/MatchZy/admins.json` neu. Ein leeres `ADMINS` erzeugt entsprechend eine leere Adminliste.

Typische Admin-Kommandos:

- `.prac` startet den Practice Mode
- `.exitprac` beendet den Practice Mode und geht zurueck in den Match-Modus
- `.playout` aktiviert oder deaktiviert Scrim-Style Playout
- `.readyrequired <zahl>` setzt, wie viele Spieler ready sein muessen
- `.roundknife` schaltet Knife Round an oder aus
- `.map <mapname>` wechselt die Map
- `.restart` setzt den Match-Zustand zurueck

Fuer einfache Praccs und Scrims brauchst du kein JSON-Matchsetup. Ein Match-JSON ist erst noetig, wenn du feste Teams, SteamIDs und BO1/BO3-Serien sauber locken willst.

## 6) Checks

```bash
docker compose config
docker compose ps
```

In der CS2-Konsole:

- `meta list` sollte Metamod anzeigen
- `meta list` sollte auch `fake_rcon`, `multiaddonmanager` und `RayTrace` zeigen, falls aktiviert
- `css_plugins list` sollte MatchZy anzeigen
- `css_plugins list` sollte je nach aktivierten Plugins auch `WeaponPaints`, `CS2-SimpleAdmin`, `PlayerSettings`, `MenuManagerCore`, `FortniteEmotesNDances`, `ExecutesPlugin` und `RollTheDice` zeigen

## 7) Troubleshooting CS2 Connect

Wenn im Log folgendes erscheint:

- `cp: cannot create regular file '/home/steam/cs2-dedicated/pre.sh/pre.sh': Read-only file system`
- `entry.sh: line 138: source: /home/steam/cs2-dedicated/pre.sh: is a directory`

dann liegt im Persistenz-Volume ein falscher Ordner `pre.sh` statt einer Datei. Einmalig reparieren:

```bash
docker compose run --rm cs2 sh -lc 'rm -rf /home/steam/cs2-dedicated/pre.sh'
docker compose up -d cs2
```

Wenn du auf ein neues Image gewechselt hast und trotzdem weiter altes Verhalten siehst, kann auch eine alte persistierte Datei `/home/steam/cs2-dedicated/pre.sh` im Volume liegen. Dann ebenfalls einmalig entfernen und den Container neu starten, damit die aktuelle `/etc/pre.sh` aus dem Image erneut ins Volume kopiert wird.

## 8) Troubleshooting "Plugins nicht geladen"

1. Im CS2-Log muss eine Zeile wie `[pre.sh] Mod bootstrap complete` erscheinen.
2. Reinstall fuer den naechsten Start erzwingen:

```bash
MOD_REINSTALL=1 docker compose up -d cs2
```

3. Plugin-Pfade pruefen:

```bash
docker compose exec cs2 sh -lc 'ls -la /home/steam/cs2-dedicated/game/csgo/addons'
docker compose exec cs2 sh -lc 'ls -la /home/steam/cs2-dedicated/game/csgo/addons/counterstrikesharp/plugins'
docker compose exec cs2 sh -lc 'ls -la /etc/pre.sh /home/steam/cs2-dedicated/pre.sh'
```

4. Metamod-SearchPath pruefen:

```bash
docker compose exec cs2 sh -lc 'grep -n "csgo/addons/metamod" /home/steam/cs2-dedicated/game/csgo/gameinfo.gi'
```

5. Wenn `WeaponPaints` geladen ist, aber nicht funktioniert:
   - Pruefe `addons/counterstrikesharp/configs/plugins/WeaponPaints/WeaponPaints.json`.
   - Pruefe DB-Zugangsdaten und `addons/counterstrikesharp/gamedata/weaponpaints.json`.

6. Wenn `CS2-SimpleAdmin` geladen ist, aber nicht richtig funktioniert:
   - Pruefe `addons/counterstrikesharp/configs/plugins/CS2-SimpleAdmin/CS2-SimpleAdmin.json`.

7. Wenn `FortniteEmotesNDances` nicht richtig funktioniert:
   - Pruefe `meta list` auf `multiaddonmanager` und `RayTrace`.
   - Pruefe `cfg/multiaddonmanager/multiaddonmanager.cfg` auf die Workshop-Addon-ID.
