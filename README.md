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
- `DBKEY`
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
6. Deploy starten.

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
- `cs2/pre.sh` wird als Hook-Datei nach `/home/steam/cs2-dedicated/pre.sh` gemountet.

### `cs2/pre.sh` Verhalten

Beim Start:

1. Loest Metamod-Release (`latest` oder gepinnt via `METAMOD_VERSION`) ueber GitHub API auf.
2. Loest MatchZy-Release (`latest` oder gepinnt via `MATCHZY_VERSION`) auf.
3. Installiert nur neu, wenn:
- Version geaendert
- Dateien fehlen
- `MOD_REINSTALL=1`
4. Patcht `gameinfo.gi` immer erneut, damit `Game    csgo/addons/metamod` in `SearchPaths` enthalten ist.
5. Speichert installierte Tags in `/home/steam/cs2-dedicated/.mod-installer/state.env`.

## 5) Erste Inbetriebnahme G5

1. `https://panel.<deine-domain>` oeffnen.
2. BasicAuth eingeben.
3. Im Panel lokal registrieren (Local Login/Register).
4. Bei Registrierung/Profil die korrekte Steam64 nutzen.
5. Durch `SUPERADMINS`/`ADMINS` werden API-Rechte anhand Steam64 vergeben.
6. CS2 Server im G5-Panel anlegen (IP/Port/RCON), danach Match erstellen und laden.

## 6) Checks / Abnahme

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

- `https://panel.<deine-domain>` fordert BasicAuth.
- `https://api.<deine-domain>/` antwortet.
- `https://panel.<deine-domain>/api/` routed auf `g5api`.

Lokale Port-Checks:

- `http://<server-ip>:27019` -> G5V
- `http://<server-ip>:27018` -> G5API

## 7) Fallback ohne `/api` Path-Routing in Coolify

Falls `panel.<domain>/api` in deiner Coolify-Instanz nicht sauber routing-faehig ist:

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
