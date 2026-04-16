# CS2 + MatchZy fuer Docker Compose und Coolify

Dieses Repository liefert einen bewusst kleinen Stack:

- CS2 Dedicated Server auf Basis von `cm2network/cs2`
- automatischen Mod-Install beim Serverstart
- `Metamod Source 2.0-dev`
- `MatchZy` inklusive `CounterStrikeSharp`, sofern das passende MatchZy-Release verfuegbar ist

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
3. Installiert die Archive nur neu, wenn sich Versionen geaendert haben, Dateien fehlen oder `MOD_REINSTALL=1` gesetzt ist.
4. Patcht `gameinfo.gi` erneut, damit `csgo/addons/metamod` in den `SearchPaths` enthalten ist.
5. Speichert die installierten Versionen in `/home/steam/cs2-dedicated/.mod-installer/state.env`.

## 4) Erste Nutzung mit MatchZy

Nach erfolgreichem Start kannst du MatchZy direkt im Server verwenden.

Typische Admin-Kommandos:

- `.prac` startet den Practice Mode
- `.exitprac` beendet den Practice Mode und geht zurueck in den Match-Modus
- `.playout` aktiviert oder deaktiviert Scrim-Style Playout
- `.readyrequired <zahl>` setzt, wie viele Spieler ready sein muessen
- `.roundknife` schaltet Knife Round an oder aus
- `.map <mapname>` wechselt die Map
- `.restart` setzt den Match-Zustand zurueck

Fuer einfache Praccs und Scrims brauchst du kein JSON-Matchsetup. Ein Match-JSON ist erst noetig, wenn du feste Teams, SteamIDs und BO1/BO3-Serien sauber locken willst.

## 5) Checks

```bash
docker compose config
docker compose ps
```

In der CS2-Konsole:

- `meta list` sollte Metamod anzeigen
- `css_plugins list` sollte MatchZy anzeigen

Wenn das passt, sollte der Server fuer Practice und Scrims benutzbar sein.

## 6) Troubleshooting CS2 Connect

Wenn im Log folgendes erscheint:

- `cp: cannot create regular file '/home/steam/cs2-dedicated/pre.sh/pre.sh': Read-only file system`
- `entry.sh: line 138: source: /home/steam/cs2-dedicated/pre.sh: is a directory`

dann liegt im Persistenz-Volume ein falscher Ordner `pre.sh` statt einer Datei. Einmalig reparieren:

```bash
docker compose run --rm cs2 sh -lc 'rm -rf /home/steam/cs2-dedicated/pre.sh'
docker compose up -d cs2
```

Wenn du auf ein neues Image gewechselt hast und trotzdem weiter altes Verhalten siehst, kann auch eine alte persistierte Datei `/home/steam/cs2-dedicated/pre.sh` im Volume liegen. Dann ebenfalls einmalig entfernen und den Container neu starten, damit die aktuelle `/etc/pre.sh` aus dem Image erneut ins Volume kopiert wird.

Zusatzcheck bei "kein Connect moeglich":

1. Server muss `SV: Connection to Steam servers successful.` und `Network socket ... opened on port 27015` zeigen.
2. Host-Firewall und Provider-Firewall muessen `27015/udp` (und optional `27015/tcp`, `27020/udp`) erlauben.
3. Teste direkt mit `connect <server-ip>:27015` in der CS2-Konsole.

## 7) Troubleshooting "Plugins nicht geladen"

Falls `meta list` oder `css_plugins list` leer ist:

1. Pruefen, ob der Hook ueberhaupt ausgefuehrt wurde. Im CS2-Log muss eine Zeile wie diese stehen:

   ```text
   [pre.sh] Mod bootstrap complete
   ```

   Wenn keine `[pre.sh] ...` Zeilen auftauchen, wurde das Skript nicht gesourct. Haeufige Ursachen:
   - Es laeuft noch ein alter Deploy-Stand mit File-Bind-Mount statt gebautem Image.
   - Im Persistenz-Volume liegt ein alter `pre.sh`-Pfad, entweder als Ordner oder als veraltete Datei. Siehe Abschnitt 7.
   - Das Image wurde nicht neu gebaut und enthaelt daher noch nicht das aktuelle `/etc/pre.sh`.

2. Reinstall fuer den naechsten Start erzwingen (z. B. nach Versionwechsel):

   ```bash
   MOD_REINSTALL=1 docker compose up -d cs2
   ```

3. Nach dem Start im Container die Plugin-Pfade pruefen:

   ```bash
   docker compose exec cs2 sh -lc 'ls -la /home/steam/cs2-dedicated/game/csgo/addons'
   docker compose exec cs2 sh -lc 'ls -la /home/steam/cs2-dedicated/game/csgo/addons/counterstrikesharp/plugins'
   docker compose exec cs2 sh -lc 'ls -la /etc/pre.sh /home/steam/cs2-dedicated/pre.sh'
   ```

4. Kontrollieren, dass der Metamod-SearchPath in `gameinfo.gi` noch drin ist:

   ```bash
   docker compose exec cs2 sh -lc 'grep -n "csgo/addons/metamod" /home/steam/cs2-dedicated/game/csgo/gameinfo.gi'
   ```

   Keine Ausgabe -> der Patch wurde nicht (mehr) angewendet. Container neu starten; `pre.sh` patcht bei jedem Start erneut.

5. Wenn `meta list` weiterhin `Unknown command 'meta'!` zeigt, obwohl `[pre.sh] Mod bootstrap complete` im Log steht:
   - Dann wurde sehr wahrscheinlich der falsche Metamod-Zweig installiert.
   - Fuer CS2 muss ein `2.0-dev`-Build mit `bin/linuxsteamrt64/libserver.so` installiert sein.
   - Ein altes `1.12.x`-Release mit nur `bin/linux64/server.so` reicht fuer CS2 nicht.
