# Coolify One-Repo Deploy: CS2 + MatchZy + Get5

Dieses Repository liefert einen einzigen Compose-Stack fuer:

- CS2 Dedicated (`cm2network/cs2`)
- automatischen Mod-Install beim Serverstart (`Metamod` + `MatchZy with CSSharp`)
- `g5api` + `g5v` + `mariadb` + `redis`
- BasicAuth vor dem Panel (`g5v`)
- Local Login im G5-Panel (`LOCALLOGINS=true`)

## Enthaltene Dateien

- `docker-compose.yml`
- `cs2/pre.sh` (idempotenter Auto-Installer)
- `.env.example`
- `README.md`

## 1) Vorbereitung

1. `.env.example` nach `.env` kopieren und Werte setzen.
2. Pflichtwerte:
- `SRCDS_TOKEN`
- `CS2_RCONPW`
- `MARIADB_ROOT_PASSWORD`
- `MARIADB_PASSWORD`
- `REDIS_PASSWORD`
- `DBKEY` (muss 16, 24 oder 32 Zeichen lang sein)
- `SHAREDSECRET`
- `HOSTNAME`
- `CLIENTHOME`
- `APIURL`
- `STEAMAPIKEY`
- mindestens eine Steam64 in `SUPERADMINS`

## 2) Coolify Deploy (Reihenfolge)

1. Repository als Compose Resource in Coolify verbinden.
2. `docker-compose.yml` laden.
3. Environment-Variablen aus `.env` in Coolify setzen.
4. Domains mappen:
- Service `g5v` -> `https://panel.<deine-domain>`
- Service `g5api` -> `https://api.<deine-domain>`
- Service `g5api` -> `https://panel.<deine-domain>/api`
5. Beim `g5api`-Domain-Mapping den Service-Port `3301` verwenden.
6. Optional, aber fuer Coolify oft robuster: `G5V_API_URL=https://api.<deine-domain>` setzen.
   Dann spricht das Frontend direkt die API-Subdomain an und ist nicht auf funktionierendes `/api`-Path-Routing angewiesen.
7. Deploy starten.

Hinweis: Es werden keine custom networks in Compose definiert (Coolify-kompatibel).

## 3) Was der Stack macht

### Portbelegung (aufsteigend ab 27015)

- `27015` -> CS2 Game (`tcp/udp`)
- `27016` -> MariaDB (`localhost only`)
- `27017` -> Redis (`localhost only`)
- `27018` -> G5API
- `27019` -> G5V Panel
- `27020` -> CS TV (`udp`, reserviert)

### CS2

- Exponiert:
- `27015/tcp`
- `27015/udp`
- `27020/udp`
- Persistenz: `cs2_data`
- `cs2/Dockerfile` kopiert `cs2/pre.sh` nach `/etc/pre.sh`.
  Das Base-Image (`cm2network/cs2` = `joedwards32/cs2`) kopiert `/etc/pre.sh` beim Start nach `/home/steam/cs2-dedicated/pre.sh` und sourct diese Datei in `entry.sh` **nach** dem SteamCMD-Update und **vor** dem Start des `cs2`-Prozesses.
  Daraus folgen zwei Dinge:
  - Die gesamte Logik in `pre.sh` laeuft in einer Subshell, damit `set -e`, Traps und Fehler-Exits die `entry.sh` nicht abbrechen.
  - Wird Metamod/MatchZy bereits erkannt, macht das Skript nur einen Re-Patch der `gameinfo.gi` und ist in Sekunden fertig.
  - Es gibt keinen File-Bind-Mount mehr. Das ist fuer Coolify wichtig, weil der Compose-Run ueber einen Helper-Container laeuft und Repo-Dateien sonst auf dem Docker-Host nicht als regulaere Datei verfuegbar sind.

### `cs2/pre.sh` Verhalten

Beim Start:

1. Loest Metamod fuer CS2 ueber die offiziellen `2.0-dev`-Snapshots von `metamodsource.net` auf.
   - `METAMOD_VERSION=latest` zieht den neuesten `2.0-dev` Build.
   - Optional kann ein Build direkt gepinnt werden, z. B. `METAMOD_VERSION=1383`.
2. Loest MatchZy-Release (`latest` oder gepinnt via `MATCHZY_VERSION`) auf.
3. Installiert nur neu, wenn:
- Version geaendert
- Dateien fehlen
- `MOD_REINSTALL=1`
4. Patcht `gameinfo.gi` immer erneut, damit `Game    csgo/addons/metamod` in `SearchPaths` enthalten ist.
5. Speichert installierte Tags in `/home/steam/cs2-dedicated/.mod-installer/state.env`.

## 4) Erste Inbetriebnahme G5

1. `https://panel.<deine-domain>` oeffnen.
2. Im Panel lokal registrieren (Local Login/Register).
3. Bei Registrierung/Profil die korrekte Steam64 nutzen.
4. Durch `SUPERADMINS`/`ADMINS` werden API-Rechte anhand Steam64 vergeben.
5. CS2 Server im G5-Panel anlegen (IP/Port/RCON), danach Match erstellen und laden.

## 5) Checks / Abnahme

Compose:

```bash
docker compose config
```

Container:

```bash
docker compose ps
```

CS2 Console:

- `meta list` zeigt Metamod.
- `css_plugins list` zeigt MatchZy.

HTTP:

- `https://panel.<deine-domain>`.
- `https://api.<deine-domain>/` antwortet.
- `https://panel.<deine-domain>/api/` routed auf `g5api`.
- Wenn `G5V_API_URL` gesetzt ist, nutzt das Frontend stattdessen direkt diese API-URL.

Lokale Port-Checks:

- `http://<server-ip>:27019` -> G5V
- `http://<server-ip>:27018` -> G5API

## 6) Fallback ohne `/api` Path-Routing in Coolify

Falls `panel.<domain>/api` in deiner Coolify-Instanz nicht sauber routing-faehig ist, setze einfach:

```bash
G5V_API_URL=https://api.<deine-domain>
```

Das in diesem Repo enthaltene `g5v`-Wrapper-Image patched dann beim Containerstart den Frontend-Fallback von `"/api"` auf diese absolute URL.

Nur falls du bewusst ein eigenes Frontend-Build brauchst, ist weiterhin ein komplett eigenes `g5v`-Image noetig:

1. Eigenes `g5v` Image bauen:

```bash
docker build -t your-registry/g5v:custom -f DockerfileFull \
  --build-arg VUE_APP_G5V_API_URL=https://api.<deine-domain> \
  https://github.com/PhlexPlexico/G5V.git
```

2. In `docker-compose.yml` fuer `g5v` auf `your-registry/g5v:custom` wechseln.
3. Dann nur noch zwei reine Subdomains nutzen:
- `panel.<domain>` -> `g5v`
- `api.<domain>` -> `g5api`

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

Zusatzcheck bei "kein Connect moeglich":

1. Server muss `SV: Connection to Steam servers successful.` und `Network socket ... opened on port 27015` zeigen.
2. Host-Firewall und Provider-Firewall muessen `27015/udp` (und optional `27015/tcp`, `27020/udp`) erlauben.
3. Teste direkt mit `connect <server-ip>:27015` in der CS2-Konsole.

## 8) Troubleshooting "Plugins nicht geladen"

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
