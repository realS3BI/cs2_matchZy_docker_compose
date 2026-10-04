# Playbook

Playbook ist eine eigenständige Plattform für Counter-Strike 2. Sie verbindet eine Lineup-Bibliothek, Granatentraining im Spiel, einen Review-Ablauf für Aufnahmen und die Verwaltung eines CS2-Servers. Zum Projekt gehören das Web-Dashboard, ein eigenes CounterStrikeSharp-Plugin, das Panorama-HUD und eine Windows-App für Review-Aufnahmen.

MatchZy ist ein optionaler Servermodus für Matches und Scrims. Das eigene Playbook-Training läuft ohne MatchZy. Metamod und CounterStrikeSharp bilden die gemeinsame Servergrundlage.

[Dokumentation](docs/README.md) · [Quellcode](https://github.com/realS3BI/playbook) · [Fehler melden](https://github.com/realS3BI/playbook/issues)

## Was Playbook bietet

- Maps und Lineups mit Radarpositionen, Wurfdaten, Bildern, Videos und persönlichen Favoriten.
- Eigenes Granatentraining mit Respawn, unbegrenzten Granaten, Bots, Teleports und wiederholbaren Würfen.
- Ein kompaktes Ingame-Panel mit Mausbedienung und immer neun Listenplätzen pro Seite.
- Aufnahmen und Reviews mit Erstellerrechten sowie den Admin-Freigaben „Offiziell“ und „Must Know“.
- Steam-Anmeldung, Rollenverwaltung, Serverkonsole, Plugins, Workshop-Maps, Diagnose und geplante Neustarts.
- Eine Windows-App, die CS2 mit der Website für Review-Fotos und -Videos verbindet.

## Lokal starten

Voraussetzungen: Node.js ab 22 und ein laufender Docker-Dienst mit Docker Compose ab 2.22.

```bash
git clone https://github.com/realS3BI/playbook.git
cd playbook
./dev.sh
```

Unter Windows funktioniert `node dev.mjs`. Das Skript startet MongoDB, API und Vite. Die Website ist unter `http://localhost:5173` erreichbar. Es legt `.env.development` mit einem zufälligen Session-Secret an. Für Admin-Rechte die eigene Steam64-ID übergeben:

```bash
node dev.mjs --admin DEINE_STEAM64_ID
```

Für LAN oder Tailscale zusätzlich `--url http://DEINE_ADRESSE:5173` angeben. Steam-Anmeldung und Browser müssen dieselbe Adresse verwenden. Strg+C stoppt die Container; die Entwicklungsdaten bleiben im Compose-Projekt `playbook-dev` erhalten. Diese Umgebung startet keinen Gameserver.

## Server betreiben

Der vollständige Stack läuft mit Docker Compose auf einem Linux-Host für CS2 oder als Compose-Ressource in Coolify. Details zu Ports, Domain und persistenten Volumes stehen in der [Betriebsanleitung](docs/operations.md).

1. `.env.example` als `.env` kopieren. Öffentliche URL, Admin-Steam64-ID und Session-Secret eintragen. Ein Secret lässt sich mit `openssl rand -hex 32` erzeugen.
2. `docker compose up -d --build` ausführen. In Coolify die Variablen in der bestehenden Ressource setzen und das Repository verbinden.
3. Das Dashboard über einen Reverse Proxy auf dessen internem Port `8080` erreichbar machen und mit Steam anmelden.
4. Unter „Server“ Steam Game Server Login Token für App 730, RCON-Passwort, Startmap und Modus konfigurieren. Einstellungen übernehmen und CS2 starten.
5. Für das Ingame-Panel die [HUD-Assets](training-hud/README.md) installieren oder über das Workshop-Addon ausliefern.

Neue Compose-Installationen heißen `playbook`. Vor einem Update einer bestehenden Installation zuerst die [Umstiegsanleitung](docs/migration-playbook.md) lesen. Ein anderer Compose-Projektname wählt andere Volumes aus.

## Servermodi

| Modus | Aufgabe |
| --- | --- |
| Nades | Eigenständiges Playbook-Training mit Lineups und Ingame-Panel. |
| MatchZy | Matches und Scrims über das externe MatchZy-Plugin; Playbook ist auch in dessen Practice-Modus verfügbar. |
| Warmup / Aim Botz | Aim-Training auf der Workshop-Map Aim Botz. |
| Vanilla + framework | CS2 mit Metamod, CounterStrikeSharp und der Playbook-Rollenprüfung. |

Es ist immer genau ein Modus aktiv. Der Modus und eigene Servernamen bleiben bei der Umbenennung erhalten. [Funktionen und Befehle je Modus](docs/playbook.md).

## Projektaufbau

| Verzeichnis | Inhalt |
| --- | --- |
| `admin-panel/` | React-Website, API, Datenhaltung und Serververwaltung. |
| `server-plugin/Playbook/` | Eigenes C#-Server-Plugin, gebaut als `Playbook.dll`. |
| `server-plugin/Playbook.Tests/` | Tests für Training, Rollen, Lineups und Panel. |
| `training-hud/` | Panorama-Layout, Styles und lokale sowie Workshop-Builds. |
| `playbook-desktop/` | Windows-App mit Electron und nativem Aufnahme-Hilfsprogramm. |
| `cs2/` | CS2-Image, Bootstrap und Installation der externen Plugins. |
| `docs/` | Betrieb, Architektur, Migration und Bedienung. |

[Entwicklung und Prüfungen](CONTRIBUTING.md) · [Architektur und Datenfluss](docs/architecture.md) · [Windows-App](playbook-desktop/README.md)

## Eingebundene Projekte

Playbook verwendet unter anderem [CounterStrikeSharp](https://github.com/roflmuffin/CounterStrikeSharp), [Metamod:Source](https://www.sourcemm.net/) und das [CS2-Docker-Image von CM2Walki](https://github.com/CM2Walki/CS2). [MatchZy](https://github.com/shobhit-pathak/MatchZy) ist die Integration für den gleichnamigen Modus. Die Namen, Herkunft und Lizenzen dieser Komponenten bleiben eigenständig. Quellen eingebundener Kartenbilder und Symbole sind in den jeweiligen `sources.json`-Dateien dokumentiert.
