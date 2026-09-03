# CS2 + MatchZy fuer Docker Compose und Coolify

Dieses Repository liefert einen bewusst kleinen Stack:

- CS2 Dedicated Server auf Basis von `cm2network/cs2`
- automatischen Mod-Install beim Serverstart
- `Metamod Source 2.0-dev`
- genau einen Servermodus: `MatchZy`, `cs2-executes` oder Vanilla mit Framework
- `CounterStrikeSharp` aus dem offiziellen Release
- optionale Plugins: `cs2-fake-rcon`, `WeaponPaints`, `CS2-SimpleAdmin`, `FortniteEmotesNDances` und Workshop-Maps
- Web-Control-Room mit zentraler Modus-/Plugin-Policy, rollenbasiertem Zugriff, Diagnostik und geplantem Neustart

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
2. Genau zwei Werte setzen:

| Variable | Zweck |
| --- | --- |
| `ADMIN_PANEL_PASSWORD` | Erstzugang zum geschuetzten Web-Panel |
| `ADMIN_PANEL_SESSION_SECRET` | Signiert Login-Sessions; einen langen Zufallswert verwenden |

Es gibt keine optionalen Deployment-ENVs mehr. `SRCDS_TOKEN`, `CS2_RCONPW`, Servername, Maps, Plugins, Versionen, Admins und der Neustartplan werden ausschliesslich in MatchZy Control gepflegt und in MongoDB gespeichert. Interne Pfade, MongoDB-Verbindung, Ports und Sync-Intervalle sind Teil des Compose-Stacks und nicht von aussen konfigurierbar.

Neue Installationen starten das Web-Panel zuerst. Der CS2-Container wartet, bis im Bereich `Server` mindestens der Steam Game Server Login Token und das RCON-Passwort eingetragen und mit `Apply & restart` angewendet wurden.

## 2) Deploy mit Docker Compose oder Coolify

1. Repository als Compose-Ressource in Coolify verbinden oder lokal mit `docker compose` nutzen.
2. `docker-compose.yml` deployen.
3. In Coolify nur `ADMIN_PANEL_PASSWORD` und `ADMIN_PANEL_SESSION_SECRET` setzen.
4. Nur die Spielports am Host freigeben:
   - `27015/tcp`
   - `27015/udp`
   - `27020/udp`
5. In Coolify eine Domain fuer den Service `admin-panel` anlegen und als Ziel den internen Container-Port `8080` waehlen.
6. Panel oeffnen, Steam-Token und RCON-Passwort im Bereich `Server` eintragen und `Apply & restart` ausfuehren.

Nach Code-Aenderungen den Stack neu bauen:

```bash
docker compose up -d --build
```

Der `cs2` Service nutzt weiterhin Docker-Volumes. Das Admin-Panel mountet das Runtime-Volume `admin_panel_runtime`, das Bild-Volume `admin_panel_uploads`, das CS2-Datenvolume `cs2_data` und den Docker-Socket, damit es Settings schreiben, MatchZy-Nades synchronisieren und den `cs2` Container neu starten kann.

### Migration von den alten ENVs

Bestehende Einstellungen in MongoDB bleiben unveraendert. Falls MongoDB noch keine Settings enthaelt, importiert das Panel beim ersten Start die letzte `settings.env` und `csharp-admins.json` aus dem Runtime-Volume. Danach kannst du alle alten Server- und Plugin-Variablen in Coolify loeschen. Nur die beiden Panel-Secrets bleiben stehen.

Zu loeschen sind insbesondere:

- Server: `SRCDS_TOKEN`, `CS2_SERVERNAME`, `CS2_RCONPW`, `CS2_PW`, `CS2_MAXPLAYERS`, `CS2_STARTMAP`, `CS2_PORT`, `TV_PORT`, `CS2_ADDITIONAL_ARGS`
- Modi und Plugins: `SERVER_MODE`, `MATCHZY_ENABLED`, `EXECUTES_ENABLED`, alle `*_VERSION`, alle Plugin-`*_ENABLED`, `FORTNITE_EMOTES_WORKSHOP_ADDON_ID`, `CS2_WORKSHOP_MAPS`, `CS2_WORKSHOP_MAPS_ENABLED`, `CS2_WORKSHOP_FORCE_DOWNLOAD`
- MatchZy und Wartung: `MATCHZY_SMOKE_COLOR`, `MATCHZY_SAVE_NADES_AS_GLOBAL`, `MATCHZY_CHAT_PREFIX`, `AUTO_RESTART_ENABLED`, `AUTO_RESTART_TIME`, `AUTO_RESTART_TIMEZONE`, `ADMINS`, `MOD_REINSTALL`
- Alte Infrastruktur-Overrides: `COMPOSE_PROJECT_NAME`, `ADMIN_PANEL_PORT`, `ADMIN_PANEL_CONTROL_MODE`, `ADMIN_PANEL_CS2_CONTAINER`, `MONGODB_URI`, `MONGODB_DB`, alle `ADMIN_PANEL_NADES_*`, `ADMIN_PANEL_LIVE_MATCHZY_NADES_FILE`, `UPLOADTHING_TOKEN`

Auch weitere alte `COMPOSE_*`- oder `ADMIN_PANEL_*`-Overrides haben keine Wirkung mehr. Ausgenommen sind ausschliesslich `ADMIN_PANEL_PASSWORD` und `ADMIN_PANEL_SESSION_SECRET`.

## 3) Web-Admin-Panel

Das Compose-Projekt enthaelt zusaetzlich:

- `admin-panel` auf dem internen Container-Port `8080`, ohne Host-Port-Binding
- `mongodb` mit Volume `admin_panel_mongodb`

Das Panel-Frontend ist eine Vite/React-App mit Tailwind CSS v4 und lokalen shadcn-style UI-Komponenten. Die Navigation trennt Overview, Server, Plugins, Access, Maintenance, Nades, Diagnostics und Logs. Der Produktionsbuild wird beim Docker-Build erzeugt und vom Express-Backend ausgeliefert.

Das Panel findet den `cs2` Container ueber Docker-Compose-Labels und steuert ihn ueber den gemounteten Docker-Socket.

Start:

```bash
docker compose up -d --build admin-panel mongodb
```

MongoDB ist die einzige laufende Konfigurationsquelle. `Save draft` speichert ohne Unterbrechung; `Apply & restart` validiert die gesamte Konfiguration, schreibt Runtime-Dateien und startet CS2 neu:

- `settings.env` fuer Server- und Plugin-Settings
- `csharp-admins.json` fuer CounterStrikeSharp-Admins inklusive Flags
- `matchzy-admins.json` als bewusst leere Legacy-Datei
- `matchzy-savednades.json` als Start-/Apply-Fallback fuer MatchZy-Nades

Der `cs2` Container liest diese lokalen Dateien beim Start ein. MongoDB bleibt damit im Admin-Panel; der Gameserver braucht keine DB-Verbindung und kann auch mit den letzten gueltigen Runtime-Dateien starten, wenn MongoDB nicht verfuegbar ist. `SERVER_MODE` ist die einzige Moduswahl. Der Bootstrap leitet daraus `MATCHZY_ENABLED` und `EXECUTES_ENABLED` ab und kann beide nie gleichzeitig laden.

MatchZy-Nades werden zusaetzlich live bidirektional synchronisiert. Das Panel schreibt beim Speichern sofort in die echte Datei `game/csgo/cfg/MatchZy/savednades.json` im `cs2_data` Volume. Wenn MatchZy oder ein Spieler ingame diese Datei aendert, importiert das Panel die Aenderung automatisch zurueck nach MongoDB. Der Sync prueft die Datei alle zwei Sekunden und verhindert Rueckkopplungen ueber Dateihashes. Lineup-Bilder werden ohne externen Anbieter im persistenten Volume `admin_panel_uploads` gespeichert.

Fuer Coolify ist das der robuste Standardpfad, weil der Container nicht das Git-Repo oder Coolifys interne `.env` bearbeiten muss. Danach startet das Panel den `cs2` Container ueber den Docker-Socket neu.

Apply entspricht technisch:

```bash
docker restart <cs2-container>
```

Der Button `Restart now` fuehrt nur aus:

```bash
docker restart <cs2-container>
```

### Geplanter Neustart

Das Panel startet CS2 standardmaessig taeglich um `05:00` in `Europe/Vienna` neu. Aktivierung, Uhrzeit und IANA-Zeitzone werden im Bereich `Maintenance` gepflegt.

Der Scheduler beansprucht den Tages-Slot atomar in MongoDB. Dadurch fuehren auch mehrere Panel-Instanzen denselben geplanten Neustart nur einmal aus. Das ist eine pragmatische Uptime-Massnahme gegen schleichende Server-Degradation; ein allgemeiner Tick-Counter-Overflow wird damit nicht als gesicherte Ursache behauptet.

### MatchZy-Diagnose und One-shot-Reparatur

Der Tab `Diagnostics` verfolgt die komplette Startkette:

```text
CS2 container -> Mod bootstrap -> Metamod -> CounterStrikeSharp -> aktiver Servermodus
```

Das Panel liest dafuer den Zustand des `cs2` Containers, die Startup-Logs seit dem letzten Containerstart, feste Plugin-Dateipfade und die Versions-Tags aus `.mod-installer/state.env`. Der Diagnose-Report enthaelt keine Environment-Werte oder Zugangsdaten und kann ueber `Copy report` sicher fuer die Fehlersuche kopiert werden.

Wenn die Kette blockiert ist, setzt `Repair mods once` fuer genau einen Start `MOD_REINSTALL=1` und startet den `cs2` Container neu. Das Panel setzt den Wert nach Abschluss des Bootstrap-Hooks automatisch auf `0` zurueck. Der Button ist bei einer vollstaendig gesunden Startkette deaktiviert.

`GET /healthz` ist ohne Panel-Login erreichbar und wird vom Docker-Healthcheck des `admin-panel` Containers verwendet. In Coolify kann derselbe Pfad fuer einen zusaetzlichen HTTP-Healthcheck genutzt werden.

Nach Aenderungen an `cs2/` oder `admin-panel/` muss in Coolify die gesamte Compose-Ressource neu gebaut und deployed werden. Ein einfacher Neustart verwendet weiterhin die alten Images.

### Coolify Domain / Vite Routing

Das Panel lauscht intern auf Port `8080` und liefert den gebauten Vite/React-Client direkt ueber Express aus. Der Stack bindet diesen Port nicht an den Host. Deshalb koennen weitere Coolify-Projekte intern ebenfalls Port `8080` verwenden, ohne miteinander zu kollidieren.

In Coolify die Domain dem Service `admin-panel` zuordnen und den Zielport `8080` eintragen. Aufgerufen wird das Panel normal ueber die Domain, zum Beispiel `https://panel.example.com`. An die URL kommt kein `:8080`.

Wichtig: Der `admin-panel` Container mountet den Docker-Socket, damit er den `cs2` Container neu starten kann. Das ist funktional, aber sicherheitsrelevant: Wer Zugriff auf das Panel bekommt, kann indirekt Docker auf dem Host steuern. Wenn das Panel oeffentlich erreichbar ist, sollte es hinter HTTPS/Reverse-Proxy laufen; fuer produktiven Betrieb sind zusaetzlich IP-Allowlisting oder VPN empfehlenswert.

### Einheitliche Rollen und Admins

MongoDB ist die einzige Adminquelle des Panels. Jede Steam64ID bekommt eine der Rollen `Owner`, `Match operator`, `Moderator` oder `Custom`. Daraus werden CounterStrikeSharp-Flags erzeugt, z. B.:

- `@css/root`
- `@css/config`
- `@custom/prac`
- `@css/map`
- `@css/rcon`
- `@css/chat`

Beim Anwenden erzeugt das Panel `csharp-admins.json`. MatchZy nutzt diese CounterStrikeSharp-Rechte ebenfalls; die alte MatchZy-Adminliste bleibt leer, damit keine zweite, abweichende Berechtigungsquelle entsteht:

- `game/csgo/addons/counterstrikesharp/configs/admins.json`
- `game/csgo/cfg/MatchZy/admins.json`

Falls bei einer bestehenden Installation noch keine Admin-Daten in MongoDB liegen, importiert das Panel die letzte `csharp-admins.json` aus dem Runtime-Volume. Neue Admins werden ausschliesslich im Bereich `Access` angelegt.

### MatchZy Nades

Das Panel pflegt MatchZy-Nades in MongoDB und synchronisiert sie live mit:

```text
game/csgo/cfg/MatchZy/savednades.json
```

Panel-Aenderungen werden ohne CS2-Restart in die Live-Datei geschrieben. Ingame gespeicherte Nades werden beim naechsten Sync-Poll importiert und erscheinen nach einem Panel-Refresh in der Nades-Ansicht. `Apply & Restart CS2` schreibt weiterhin die Runtime-Datei `matchzy-savednades.json`, damit der Server beim naechsten Start auch ohne MongoDB-Verbindung den letzten gueltigen Stand uebernehmen kann.

## 4) Was der Stack macht

### Ports

- `27015` -> CS2 Game (`tcp/udp`)
- `27020` -> CS TV (`udp`, reserviert)

### Startverhalten

`cs2/entrypoint.sh` synchronisiert vor jedem Start `/etc/pre.sh` und `/etc/post.sh` in das Persistenz-Volume. Danach wird `cs2/pre.sh` vor dem Start des CS2-Prozesses ausgefuehrt und erledigt Folgendes:

1. Loest Metamod fuer CS2 ueber die offiziellen `2.0-dev` Builds auf.
2. Loest nur das Release des mit `SERVER_MODE` gewaehlten Modus auf und entfernt den jeweils anderen Modus.
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
5. Schreibt `addons/counterstrikesharp/configs/admins.json` aus der vom Panel erzeugten Runtime-Datei; `cfg/MatchZy/admins.json` bleibt leer.
6. Schreibt nur im MatchZy-Modus `cfg/MatchZy/config.cfg` und die Nade-Runtime-Datei.
7. Schreibt bei Bedarf `cfg/multiaddonmanager/multiaddonmanager.cfg` aus Fortnite Emotes und aktivierten `CS2_WORKSHOP_MAPS` neu.
8. Patcht `gameinfo.gi` erneut, damit `csgo/addons/metamod` in den `SearchPaths` enthalten ist.
9. Speichert die installierten Versionen in `/home/steam/cs2-dedicated/.mod-installer/state.env`.

## 5) Zusatzplugins

### cs2-fake-rcon

- Ist standardmaessig deaktiviert.
- Stellt `fake_rcon_password` und `fake_rcon` bereit.

### WeaponPaints

- Ist standardmaessig deaktiviert und muss bewusst aktiviert werden.
- Benoetigt MySQL laut Projekt-Doku.
- `cs2/pre.sh` kopiert automatisch `weaponpaints.json` nach `addons/counterstrikesharp/gamedata/`.
- `cs2/pre.sh` setzt in `addons/counterstrikesharp/configs/core.json` nach Moeglichkeit `FollowCS2ServerGuidelines` auf `false`, wie vom Projekt verlangt.
- Das Panel zeigt deshalb eine GSLT-/Server-Guideline-Warnung.
- Danach musst du `addons/counterstrikesharp/configs/plugins/WeaponPaints/WeaponPaints.json` mit deinen DB-Daten pflegen.

### CS2-SimpleAdmin

- Ist standardmaessig deaktiviert.
- Abhaengigkeiten `PlayerSettingsCS2`, `AnyBaseLibCS2` und `MenuManagerCS2` werden automatisch mit installiert.
- Beim ersten Start erzeugt das Plugin seine Konfiguration unter:

```text
addons/counterstrikesharp/configs/plugins/CS2-SimpleAdmin/CS2-SimpleAdmin.json
```

### FortniteEmotesNDances

- Ist standardmaessig deaktiviert.
- Benoetigt laut Projekt `MultiAddonManager` und `Ray-Trace`; beides wird automatisch mit installiert.
- `cs2/pre.sh` traegt automatisch die Workshop-Addon-ID `3328582199` in `cfg/multiaddonmanager/multiaddonmanager.cfg` ein.
- Aktivierung und Deaktivierung erfolgen im Bereich `Plugins`.

### Workshop-Maps

Workshop-Maps werden im Bereich `Server` als komma-separierte Liste gepflegt. Akzeptiert werden reine Workshop-IDs und Steam-Workshop-Links:

```text
https://steamcommunity.com/sharedfiles/filedetails/?id=3070244462,https://steamcommunity.com/sharedfiles/filedetails/?id=3077265396
3070244462,3077265396
```

Wenn `Load workshop maps` deaktiviert ist, bleiben die IDs oder Links gespeichert, werden beim Containerstart aber nicht geladen und nicht in `MultiAddonManager` geschrieben.

Wenn `Load workshop maps` aktiviert ist, extrahiert `cs2/pre.sh` beim Containerstart daraus die IDs, entfernt Duplikate und schreibt sie in:

```text
game/csgo/cfg/multiaddonmanager/multiaddonmanager.cfg
```

Wenn Fortnite Emotes aktiviert ist, wird die zugehoerige Workshop-ID zusaetzlich in dieselbe `mm_extra_addons`-Liste geschrieben. Bei aktivierten Workshop-Maps bleibt `MultiAddonManager` auch ohne Fortnite Emotes installiert.

Die Option `Check downloads on every map load` steuert, ob MultiAddonManager die gemounteten Workshop-Addons bei jedem Laden erneut prueft oder herunterlaedt.

### Servermodi

- `MatchZy` installiert MatchZy und entfernt Executes.
- `Executes` installiert Executes und entfernt MatchZy.
- `Vanilla + framework` entfernt beide; Metamod und CounterStrikeSharp bleiben installiert.

Der im Bereich `Plugins` gewaehlte Servermodus ist die einzige Moduswahl. Die internen Runtime-Werte fuer MatchZy und Executes werden daraus abgeleitet und koennen nicht getrennt gesetzt werden.

## 6) Erste Nutzung mit MatchZy

Nach erfolgreichem Start kannst du MatchZy direkt im Server verwenden.

Admins werden im Bereich `Access` mit Steam64ID und Rolle angelegt. Bei einer bestehenden Installation importiert das Panel die letzte CounterStrikeSharp-Admin-Datei aus dem Runtime-Volume, falls MongoDB noch keine Admins enthaelt.

Der Bootstrap schreibt ausserdem:

- `game/csgo/cfg/MatchZy/config.cfg`

Die vom Panel erzeugte `csharp-admins.json` ist fuehrend; MatchZys eigene Admin-Datei wird leer geschrieben.

Die MatchZy-Config enthaelt aktuell diese automatisch gesetzten Werte aus den Panel-Feldern:

- `matchzy_smoke_color_enabled` aus `MATCHZY_SMOKE_COLOR`
- `matchzy_chat_prefix` ausschliesslich aus `MATCHZY_CHAT_PREFIX`
- Leeres `MATCHZY_CHAT_PREFIX` faellt auf `[{Green}MatchZy{Default}]` zurueck
- Der Prefix wird nicht mehr legacy-normalisiert; nutze die vollstaendige MatchZy-Syntax

Beispiele fuer das Feld `Chat prefix`:

```text
[{Green}MatchZy{Default}]
leer -> faellt auf [{Green}MatchZy{Default}] zurueck
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

Nach Aenderungen an den Workshop-Einstellungen `Apply & restart` ausfuehren. Ein Image-Neubau ist dafuer nicht erforderlich.

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

Wichtig: Die Workshop-Liste enthaelt Links oder IDs zum Downloaden und Mounten, wird aber nur bei aktivierter Option genutzt. Fuer `.map` brauchst du den internen Mapnamen der Workshop-Map, nicht zwingend den Titel auf Steam. `ds_workshop_listmaps` ist der einfachste Weg, diesen Namen zu finden.

## 7) Checks

```bash
docker compose config
docker compose ps
```

In der CS2-Konsole:

- `meta list` sollte Metamod anzeigen
- `meta list` sollte auch `fake_rcon`, `multiaddonmanager` und `RayTrace` zeigen, falls aktiviert oder fuer Workshop-Maps benoetigt
- `css_plugins list` sollte den mit `SERVER_MODE` gewaehlten Modus anzeigen
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
2. Im Bereich `Diagnostics` die Aktion `Repair mods once` ausfuehren.

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
