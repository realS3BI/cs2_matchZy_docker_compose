# CS2 + MatchZy fuer Docker Compose und Coolify

Dieses Repository liefert einen bewusst kleinen Stack:

- CS2 Dedicated Server auf Basis von `cm2network/cs2`
- automatischen Mod-Install beim Serverstart
- `Metamod Source 2.0-dev`
- `MatchZy`
- `CounterStrikeSharp` aus dem offiziellen Release
- `cs2-fake-rcon`
- `WeaponPaints`
- `CS2-SimpleAdmin` inklusive `PlayerSettingsCS2`, `AnyBaseLibCS2` und `MenuManagerCS2`
- `FortniteEmotesNDances` inklusive `MultiAddonManager` und `Ray-Trace`
- Workshop-Maps per `CS2_WORKSHOP_MAPS`
- `cs2-executes`
- Web-Admin-Panel mit React, Tailwind CSS v4, shadcn-style Komponenten und MongoDB-Persistenz fuer Settings, CounterStrikeSharp-Admins und Restart/Recreate

## Enthaltene Dateien

- `docker-compose.yml`
- `cs2/Dockerfile`
- `cs2/entrypoint.sh`
- `cs2/pre.sh`
- `admin-panel/`
- `.env.example`
- `README.md`

## 1) Vorbereitung

1. `.env.example` nach `.env` kopieren.
2. Mindestens diese Werte setzen:
   - `SRCDS_TOKEN`
   - `CS2_RCONPW`
   - `ADMIN_PANEL_PASSWORD`
   - `ADMIN_PANEL_SESSION_SECRET`
3. Optional anpassen:
   - `CS2_SERVERNAME`
   - `CS2_PW`
   - `CS2_STARTMAP`
   - `CS2_MAXPLAYERS`
   - `METAMOD_VERSION`
   - `MATCHZY_VERSION`
   - `COUNTERSTRIKESHARP_VERSION`
   - `FAKE_RCON_ENABLED`
   - `WEAPONPAINTS_ENABLED`
   - `FORTNITE_EMOTES_ENABLED`
   - `CS2_WORKSHOP_MAPS`
   - `EXECUTES_ENABLED`
   - `SIMPLEADMIN_ENABLED`
   - `MATCHZY_SMOKE_COLOR`
   - `MATCHZY_CHAT_PREFIX`
   - `ADMINS` (nur Fallback; das Panel schreibt Admins als Runtime-Datei)

## 2) Deploy mit Docker Compose oder Coolify

1. Repository als Compose-Ressource in Coolify verbinden oder lokal mit `docker compose` nutzen.
2. `docker-compose.yml` deployen.
3. Die Environment-Variablen aus `.env` in Coolify setzen.
4. Fuer das Admin-Panel `ADMIN_PANEL_PASSWORD` sofort auf ein eigenes langes Passwort setzen. `ADMIN_PANEL_SESSION_SECRET` sollte ein langer zufaelliger Wert sein.
5. Nur die Spielports und bei Bedarf den Panel-Port freigeben:
   - `27015/tcp`
   - `27015/udp`
   - `27020/udp`
   - Web-Admin-Panel ueber Coolify-Domain auf Container-Port `8080`
6. Bei Aenderungen an `.env` den Container neu erstellen (kein reines `restart`):

```bash
docker compose up -d --build --force-recreate cs2
```

Hinweis: Der `cs2` Service nutzt weiterhin Docker-Volumes. Das Admin-Panel mountet das Runtime-Volume `admin_panel_runtime` und den Docker-Socket, damit es Settings schreiben und den `cs2` Container neu starten kann.

## 3) Web-Admin-Panel

Das Compose-Projekt enthaelt zusaetzlich:

- `admin-panel` auf `${ADMIN_PANEL_PORT:-8080}`
- `mongodb` mit Volume `admin_panel_mongodb`

Das Panel-Frontend ist eine Vite/React-App mit Tailwind CSS v4 und lokalen shadcn-style UI-Komponenten. Der Produktionsbuild wird beim Docker-Build erzeugt und vom Express-Backend ausgeliefert.

`ADMIN_PANEL_CONTROL_MODE=docker` ist der Standard fuer Coolify. Das Panel findet den `cs2` Container ueber Docker-Compose-Labels. Falls das in einer speziellen Coolify-Installation nicht eindeutig ist, setze `ADMIN_PANEL_CS2_CONTAINER` auf den Container-Namen oder die Container-ID.

Start:

```bash
docker compose up -d --build admin-panel mongodb
```

Das Panel liest bestehende Werte aus den Container-ENV oder aus MongoDB, speichert Aenderungen in MongoDB und schreibt beim Button `Apply & Restart CS2` Runtime-Dateien in das gemeinsame Volume `admin_panel_runtime`:

- `settings.env` fuer Server- und Plugin-Settings
- `csharp-admins.json` fuer CounterStrikeSharp-Admins inklusive Flags
- `matchzy-admins.json` fuer die daraus abgeleiteten MatchZy-Admins

Der `cs2` Container liest diese lokalen Dateien beim Start ein. MongoDB bleibt damit im Admin-Panel; der Gameserver braucht keine DB-Verbindung und kann auch mit den letzten gueltigen Runtime-Dateien starten, wenn MongoDB nicht verfuegbar ist.

Fuer Coolify ist das der robuste Standardpfad, weil der Container nicht das Git-Repo oder Coolifys interne `.env` bearbeiten muss. Danach startet das Panel den `cs2` Container ueber den Docker-Socket neu.

Im Standardmodus `ADMIN_PANEL_CONTROL_MODE=docker` entspricht Apply technisch:

```bash
docker restart <cs2-container>
```

Der Button `Restart CS2` fuehrt nur aus:

```bash
docker restart <cs2-container>
```

Wenn du lokal explizit den alten Compose-Recreate-Pfad nutzen willst, kannst du `ADMIN_PANEL_CONTROL_MODE=compose` setzen und zusaetzlich `COMPOSE_PROJECT_DIR`, `COMPOSE_FILE` und `ADMIN_PANEL_ENV_FILE` mounten/setzen.

### Coolify Domain / Vite Routing

Das Panel lauscht intern auf Port `8080` und liefert den gebauten Vite/React-Client direkt ueber Express aus. Alle API-Calls nutzen relative Pfade wie `/api/settings`. Dadurch funktioniert das Routing hinter einer Coolify-Domain ohne separate Vite-Proxy-Konfiguration.

In Coolify bei der Domain fuer den Service `admin-panel` den Container-Port `8080` hinterlegen, z. B. `https://panel.example.com:8080`. Der Port sagt Coolify nur, an welchen Container-Port weitergeleitet wird; extern bleibt die Domain normal ueber HTTPS erreichbar.

Wichtig: Der `admin-panel` Container mountet den Docker-Socket, damit er den `cs2` Container neu starten kann. Das ist funktional, aber sicherheitsrelevant: Wer Zugriff auf das Panel bekommt, kann indirekt Docker auf dem Host steuern. Wenn das Panel oeffentlich erreichbar ist, sollte es hinter HTTPS/Reverse-Proxy laufen; fuer produktiven Betrieb sind zusaetzlich IP-Allowlisting oder VPN empfehlenswert.

### CounterStrikeSharp Admins

Das Panel pflegt CounterStrikeSharp-Admins als Steam64ID plus Flags, z. B.:

- `@css/root`
- `@css/config`
- `@custom/prac`
- `@css/map`
- `@css/rcon`
- `@css/chat`

Beim Anwenden erzeugt das Panel `csharp-admins.json` und `matchzy-admins.json`. Wenn beide Dateien existieren, kopiert `cs2/pre.sh` sie an die Plugin-Zielpfade:

- `game/csgo/addons/counterstrikesharp/configs/admins.json`
- `game/csgo/cfg/MatchZy/admins.json`

Wenn diese Runtime-Dateien fehlen, bleibt der alte `ADMINS`-Flow als Fallback aktiv.

## 4) Was der Stack macht

### Ports

- `27015` -> CS2 Game (`tcp/udp`)
- `27020` -> CS TV (`udp`, reserviert)

### Startverhalten

`cs2/entrypoint.sh` synchronisiert vor jedem Start `/etc/pre.sh` und `/etc/post.sh` in das Persistenz-Volume. Danach wird `cs2/pre.sh` vor dem Start des CS2-Prozesses ausgefuehrt und erledigt Folgendes:

1. Loest Metamod fuer CS2 ueber die offiziellen `2.0-dev` Builds auf.
2. Loest das gewuenschte MatchZy-Release auf.
3. Installiert `CounterStrikeSharp` separat aus dem offiziellen Release, damit Plugin-Anforderungen nicht am im MatchZy-Archiv gebuendelten Stand haengen bleiben.
4. Installiert optional weitere Plugins ueber deren offizielle Release-Archive:
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
5. Schreibt `cfg/MatchZy/admins.json` und `addons/counterstrikesharp/configs/admins.json` aus den Runtime-Dateien `matchzy-admins.json` und `csharp-admins.json` oder fallback aus `ADMINS` neu.
6. Schreibt `cfg/MatchZy/config.cfg` mit `matchzy_smoke_color_enabled` aus `MATCHZY_SMOKE_COLOR` und Chat-Prefix aus ENV neu.
7. Schreibt bei Bedarf `cfg/multiaddonmanager/multiaddonmanager.cfg` aus Fortnite Emotes und `CS2_WORKSHOP_MAPS` neu.
8. Patcht `gameinfo.gi` erneut, damit `csgo/addons/metamod` in den `SearchPaths` enthalten ist.
9. Speichert die installierten Versionen in `/home/steam/cs2-dedicated/.mod-installer/state.env`.

## 5) Zusatzplugins

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

### Workshop-Maps

Workshop-Maps kannst du ueber `CS2_WORKSHOP_MAPS` als komma-separierte Liste setzen. Akzeptiert werden reine Workshop-IDs und Steam-Workshop-Links:

```bash
CS2_WORKSHOP_MAPS=https://steamcommunity.com/sharedfiles/filedetails/?id=3070244462,https://steamcommunity.com/sharedfiles/filedetails/?id=3077265396
CS2_WORKSHOP_MAPS=3070244462,3077265396
```

Beim Containerstart extrahiert `cs2/pre.sh` daraus die IDs, entfernt Duplikate und schreibt sie in:

```text
game/csgo/cfg/multiaddonmanager/multiaddonmanager.cfg
```

Wenn `FORTNITE_EMOTES_ENABLED=1` ist, wird die Fortnite-Emotes-Workshop-ID zusaetzlich in dieselbe `mm_extra_addons`-Liste geschrieben. Wenn Fortnite Emotes deaktiviert sind, aber `CS2_WORKSHOP_MAPS` gesetzt ist, bleibt `MultiAddonManager` trotzdem installiert.

Optional kannst du mit `CS2_WORKSHOP_FORCE_DOWNLOAD=1` setzen, dass MultiAddonManager die gemounteten Workshop-Addons bei jedem Laden erneut prueft/downloadet. Standard ist `0`.

### cs2-executes

- Wird standardmaessig installiert.
- Das Plugin ist eher ein eigener Trainings-/Executes-Modus als ein klassisches Scrim-Plugin.
- Wenn du nur MatchZy fuer Pracc/Scrims willst, kannst du es ueber `EXECUTES_ENABLED=0` deaktivieren.

## 6) Erste Nutzung mit MatchZy

Nach erfolgreichem Start kannst du MatchZy direkt im Server verwenden.

Wenn du MatchZy-Admins per Environment setzen willst, nutze `ADMINS` als komma-separierte Liste von Steam64IDs. Leerzeichen um die Kommata sind erlaubt.

```bash
ADMINS=76561198000000001, 76561198000000002
```

Beim Containerstart schreibt `cs2/pre.sh` daraus automatisch:

- `game/csgo/cfg/MatchZy/admins.json`
- `game/csgo/addons/counterstrikesharp/configs/admins.json`

Zusätzlich schreibt der Bootstrap immer auch:

- `game/csgo/cfg/MatchZy/config.cfg`

Die CounterStrikeSharp-Datei bekommt pro Steam64ID automatisch `@css/root`, wenn du den alten `ADMINS`-Flow nutzt. Wenn du Admins ueber das Web-Panel pflegst, ist `csharp-admins.json` fuehrend und erlaubt rollenbasierte Flags pro Admin. Ein leeres `ADMINS` erzeugt entsprechend leere Adminlisten, solange keine Runtime-Admin-Datei existiert.

Die MatchZy-Config enthaelt aktuell diese automatisch gesetzten Werte:

- `matchzy_smoke_color_enabled` aus `MATCHZY_SMOKE_COLOR`
- `matchzy_chat_prefix` aus Prefix-ENV mit Prioritaet `MATCHZY_CHAT_PREFIX` > `matchzy_chat_prefix` > `CS2_SERVERNAME`
- Werte aus `MATCHZY_CHAT_PREFIX` und `matchzy_chat_prefix` werden immer als `[<wert>]` normalisiert

Beispiele fuer den Prefix:

```bash
# Plain Text -> wird automatisch zu {Green}[Sebi CS2]{Default}
MATCHZY_CHAT_PREFIX=Sebi CS2

# Bereits mit MatchZy-Farbcodes -> bleibt unveraendert
MATCHZY_CHAT_PREFIX={Gold}Scrim{Default}

# Leerer Wert -> faellt auf CS2_SERVERNAME zurueck
MATCHZY_CHAT_PREFIX=
```

Typische Admin-Kommandos:

- `.prac` startet den Practice Mode
- `.exitprac` beendet den Practice Mode und geht zurueck in den Match-Modus
- `.playout` aktiviert oder deaktiviert Scrim-Style Playout
- `.readyrequired <zahl>` setzt, wie viele Spieler ready sein muessen
- `.roundknife` schaltet Knife Round an oder aus
- `.map <mapname>` wechselt die Map
- `.restart` setzt den Match-Zustand zurueck

Fuer einfache Praccs und Scrims brauchst du kein JSON-Matchsetup. Ein Match-JSON ist erst noetig, wenn du feste Teams, SteamIDs und BO1/BO3-Serien sauber locken willst.

### Workshop-Maps laden

Nach Aenderungen an `CS2_WORKSHOP_MAPS` den Container neu bauen/starten:

```bash
docker compose up -d --build
```

Wenn die Workshop-Map gemountet ist, kannst du sie mit MatchZy ueber den internen Mapnamen laden:

```text
.map aim_botz
```

Alternativ per MatchZy-RCON:

```text
.rcon map aim_botz
```

Wenn du den internen Mapnamen nicht kennst, frage die Workshop-Maps ueber RCON ab:

```text
.rcon ds_workshop_listmaps
.rcon ds_workshop_changelevel <mapname>
```

Als Fallback kannst du eine Workshop-Map direkt per Workshop-ID laden:

```text
map_workshop <workshop_id>
```

Wichtig: `CS2_WORKSHOP_MAPS` enthaelt Links oder IDs zum Downloaden und Mounten. Fuer `.map` brauchst du den internen Mapnamen der Workshop-Map, nicht zwingend den Titel auf Steam. `ds_workshop_listmaps` ist der einfachste Weg, diesen Namen zu finden.

## 7) Checks

```bash
docker compose config
docker compose ps
```

In der CS2-Konsole:

- `meta list` sollte Metamod anzeigen
- `meta list` sollte auch `fake_rcon`, `multiaddonmanager` und `RayTrace` zeigen, falls aktiviert oder fuer Workshop-Maps benoetigt
- `css_plugins list` sollte MatchZy anzeigen
- `css_plugins list` sollte je nach aktivierten Plugins auch `WeaponPaints`, `CS2-SimpleAdmin`, `PlayerSettings`, `MenuManagerCore`, `FortniteEmotesNDances` und `ExecutesPlugin` zeigen
- `docker compose ps admin-panel mongodb` sollte das Admin-Panel und MongoDB anzeigen

## 8) Troubleshooting CS2 Connect

Wenn im Log folgendes erscheint:

- `cp: cannot create regular file '/home/steam/cs2-dedicated/pre.sh/pre.sh': Read-only file system`
- `entry.sh: line 138: source: /home/steam/cs2-dedicated/pre.sh: is a directory`

dann liegt im Persistenz-Volume ein falscher Ordner `pre.sh` statt einer Datei. Einmalig reparieren:

```bash
docker compose run --rm cs2 sh -lc 'rm -rf /home/steam/cs2-dedicated/pre.sh'
docker compose up -d cs2
```

Wenn du auf ein neues Image gewechselt hast und trotzdem weiter altes Verhalten siehst, wurde der Container vermutlich nur neu gestartet, aber nicht neu erstellt. Nutze in dem Fall:

```bash
docker compose up -d --build --force-recreate cs2
```

## 9) Troubleshooting "Plugins nicht geladen"

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

8. Wenn Workshop-Maps nicht geladen werden:
   - Pruefe `cfg/multiaddonmanager/multiaddonmanager.cfg` auf deine Workshop-IDs.
   - Pruefe `meta list` auf `multiaddonmanager`.
   - Nutze `.rcon ds_workshop_listmaps`, um den internen Mapnamen zu finden.
