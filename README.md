# CS2 + MatchZy Control

Dieses Repository betreibt einen CS2 Dedicated Server und ein geschuetztes Web-Dashboard fuer Docker Compose oder Coolify. Servername, Steam-Registrierung, RCON, Spielmodus, Plugins, Versionen, Admins, Workshop-Maps, Nades und Wartung werden im Dashboard gepflegt.

## Deployment

Am Deployment werden genau zwei Variablen gesetzt:

```dotenv
ADMIN_PANEL_PASSWORD=
ADMIN_PANEL_SESSION_SECRET=
```

| Variable | Zweck |
| --- | --- |
| `ADMIN_PANEL_PASSWORD` | Passwort fuer den ersten Login ins Dashboard |
| `ADMIN_PANEL_SESSION_SECRET` | Langer Zufallswert zum Signieren der Login-Session |

Fuer ein starkes Session-Secret eignet sich zum Beispiel:

```bash
openssl rand -hex 32
```

Danach:

```bash
docker compose up -d --build
```

In Coolify wird das Repository als Compose-Ressource verbunden. Die beiden Werte kommen in die Environment-Ansicht der Ressource. Fuer `admin-panel` wird eine Domain mit dem internen Zielport `8080` angelegt. Der Stack bindet diesen Port nicht an den Host; dadurch kollidiert er nicht mit anderen Coolify-Projekten, die intern ebenfalls Port 8080 verwenden.

Am Host werden nur die Spielports veroeffentlicht:

- `27015/tcp`
- `27015/udp`
- `27020/udp`

## Erster Start

Beim ersten Start geschieht Folgendes:

1. MongoDB und das Dashboard starten.
2. Das Dashboard legt ein neues, typisiertes Settings-Dokument mit sicheren Defaults an.
3. Der CS2-Container wartet und startet noch keinen Gameserver.
4. Du meldest dich mit `ADMIN_PANEL_PASSWORD` an.
5. Unter `Server` traegst du mindestens den Steam Game Server Login Token fuer App 730 und ein RCON-Passwort ein.
6. `Apply & restart` schreibt die Runtime-Dateien und startet CS2.

Der Steam-Token wird also weiterhin benoetigt. Er ist aber keine Deployment-Variable mehr, sondern eine geschuetzte Servereinstellung im Dashboard.

## Clean-Slate-Verhalten

Der Stack importiert keine frueheren Environment-Dateien und keine alten Settings-Felder. Findet das Dashboard in MongoDB kein Dokument mit der aktuellen Schema-Version, ersetzt es das Settings-Dokument durch neue Standardwerte. Steam-Token und RCON-Passwort sind danach leer und muessen im Dashboard neu eingegeben werden.

Admins und Nades liegen in eigenen MongoDB-Dokumenten und bleiben bei diesem Settings-Schemawechsel erhalten. Wenn auch diese Daten komplett neu beginnen sollen, muss fuer den neuen Stack ein neues MongoDB-Volume verwendet werden.

Alte Dateien in einem bestehenden Runtime-Volume werden nicht gelesen. Fuer einen garantiert vollstaendig frischen Aufbau sollten auch die bisherigen Runtime- und CS2-Datenvolumes nicht weiterverwendet werden.

## Konfigurationsfluss

```text
Coolify / Compose
  └─ zwei Panel-Secrets
       └─ MatchZy Control
            ├─ MongoDB: settings, admins, nades
            └─ privates Runtime-Volume
                 ├─ settings.json
                 ├─ csharp-admins.json
                 ├─ matchzy-admins.json
                 └─ matchzy-savednades.json
                      └─ CS2-Container
```

`settings.json` ist der einzige Konfigurationseingang fuer den eigenen CS2-Bootstrap. Das Entry-Point-Skript uebersetzt nur die wenigen Startwerte, die das verwendete `cm2network/cs2`-Basisimage als Prozessvariablen erwartet. Diese Werte koennen nicht ueber Coolify oder Compose gesetzt werden; sie werden bei jedem Start aus der privaten JSON-Datei ueberschrieben.

## Dashboard

Das Desktop-Dashboard umfasst:

- `Overview`: Containerzustand, Modus, Spielerplaetze und letzte Aktion
- `Server`: Steam-Token, RCON, Name, Startmap, Slots, Workshop und Versions-Pins
- `Plugins`: genau ein Servermodus und optionale Komponenten
- `Access`: CounterStrikeSharp-Rollen und Steam64-IDs
- `Maintenance`: taeglicher Neustart mit IANA-Zeitzone
- `Nades`: MatchZy-Lineups mit lokalen Bildern
- `Diagnostics`: Startkette und One-shot-Reparatur
- `Logs`: aktuelle CS2-Containerlogs

`Save draft` speichert nur in MongoDB. `Apply & restart` validiert Steam-Token und RCON-Passwort, aktualisiert die Runtime-Dateien und startet den CS2-Container neu.

Das Dashboard findet den CS2-Container ueber Docker-Compose-Labels. Dafuer ist `/var/run/docker.sock` eingebunden. Dieser Zugriff ist sicherheitsrelevant; das Panel sollte ueber HTTPS und nach Moeglichkeit zusaetzlich per VPN oder IP-Allowlist geschuetzt werden.

## Servermodi und Plugins

Es ist immer genau ein Modus aktiv:

- `MatchZy`: Competitive Matches, Practice und gespeicherte Nades
- `Executes`: Executes-Szenarien ohne MatchZy
- `Vanilla + framework`: Metamod und CounterStrikeSharp ohne Match-Plugin

Metamod und CounterStrikeSharp sind feste Kernkomponenten. Optional aktivierbar sind Fake RCON, WeaponPaints, SimpleAdmin, Fortnite Emotes und Workshop-Maps. Notwendige Abhaengigkeiten werden automatisch installiert oder entfernt.

WeaponPaints benoetigt eine eigene Datenbankkonfiguration im erzeugten Plugin-Config-File und kann wegen der Server-Guideline-Einstellung ein Risiko fuer den Steam-Token darstellen. Das Dashboard zeigt deshalb eine Warnung an.

## Admins

MongoDB ist die einzige Adminquelle des Dashboards. Verfuegbar sind `Owner`, `Match operator`, `Moderator` und `Custom`. Beim Anwenden erzeugt das Panel:

```text
game/csgo/addons/counterstrikesharp/configs/admins.json
game/csgo/cfg/MatchZy/admins.json
```

MatchZys eigene Admin-Datei bleibt leer. MatchZy verwendet die Rechte aus CounterStrikeSharp, damit es keine zweite Berechtigungsquelle gibt.

## Nades und Bilder

Nades werden in MongoDB gespeichert und bidirektional mit folgender Datei synchronisiert:

```text
game/csgo/cfg/MatchZy/savednades.json
```

Panel-Aenderungen werden ohne Server-Neustart geschrieben. Ingame-Aenderungen werden beim naechsten Sync importiert. Lineup-Bilder liegen lokal im persistenten Volume `admin_panel_uploads`; es wird kein externer Upload-Dienst benoetigt.

## Wartung und Diagnose

Der geplante Neustart ist standardmaessig taeglich um `05:00` in `Europe/Vienna` aktiv und kann im Dashboard geaendert oder deaktiviert werden. MongoDB stellt sicher, dass mehrere Panel-Instanzen denselben Tages-Slot nicht doppelt ausfuehren.

Diagnostics prueft:

```text
CS2 container -> Mod bootstrap -> Metamod -> CounterStrikeSharp -> aktiver Servermodus
```

Installierte Versions-Tags werden in folgender JSON-Datei gespeichert:

```text
/home/steam/cs2-dedicated/.mod-installer/state.json
```

`Repair mods once` aktiviert fuer einen Start eine vollstaendige Neuinstallation der Mods. Nach Erfolg, Fehler oder Timeout setzt das Panel den Schalter automatisch zurueck.

## Persistente Volumes

| Volume | Inhalt |
| --- | --- |
| `admin_panel_mongodb` | Dashboard-Settings, Admins, Nades und Aktionen |
| `admin_panel_runtime` | private JSON-Dateien fuer den CS2-Start |
| `admin_panel_uploads` | Lineup-Bilder |
| `cs2_data` | Gameserver, Mods und generierte Configs |

## Checks

```bash
docker compose config
docker compose ps
docker compose logs admin-panel
docker compose logs cs2
```

Der oeffentliche Healthcheck des Panels ist:

```text
GET /healthz
```

Nach Aenderungen an `cs2/` oder `admin-panel/` muss die gesamte Compose-Ressource neu gebaut und deployed werden. Ein einfacher Container-Neustart verwendet weiterhin das vorhandene Image.

Wenn ein persistiertes `pre.sh` versehentlich als Ordner vorliegt, korrigiert das Entry-Point-Skript diesen Zustand beim Start automatisch.
