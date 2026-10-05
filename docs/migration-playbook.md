# Auf Playbook umstellen

Das Repository heißt `realS3BI/playbook`. Ab Server-Plugin 2.4.0 heißen auch die eigene Assembly, die C#-Projekte und die HUD-Assets Playbook. MatchZy bleibt als externer Servermodus erhalten. Benutzer, Rollen, Lineups, Freigaben und eigene Servereinstellungen werden durch die Umbenennung nicht zurückgesetzt.

## GitHub und lokale Klone

Im vorhandenen Klon die Remote-URL aktualisieren:

```bash
git remote set-url origin https://github.com/realS3BI/playbook.git
git remote -v
git pull --ff-only
```

Bei SSH stattdessen `git@github.com:realS3BI/playbook.git` verwenden. Der lokale Verzeichnisname ist frei wählbar. Ein bestehender Klon darf weiterhin `cs2_matchZy_docker_compose` heißen; die Build-Skripte hängen davon nicht ab.

GitHub leitet alte Repository- und Git-URLs weiter. Den alten Repository-Namen deshalb nicht erneut vergeben. Die [GitHub-Dokumentation zur Umbenennung](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) beschreibt die Ausnahmen, insbesondere GitHub Pages und veröffentlichte Actions. Die Desktop-Publish-Konfiguration zeigt bereits auf `realS3BI/playbook`; bestehende Releases bleiben im selben Repository.

In Coolify die Repository-Verknüpfung auf `realS3BI/playbook` aktualisieren und die bestehende Ressource weiterverwenden. Domain, Deployment-Branch, Webhook und automatisches Deployment prüfen. Keine zweite Ressource mit leeren Volumes anlegen.

## Bestehende Compose-Daten erhalten

Neue Installationen verwenden `playbook` beziehungsweise `playbook-dev`. Docker leitet die Namen der verwalteten Volumes vom Compose-Projekt ab. Ein einfacher Wechsel des Projektnamens übernimmt alte Daten daher nicht.

Auf dem bisherigen Host vor dem ersten Update den tatsächlichen Namen prüfen:

```bash
docker compose ls
docker volume ls
```

Für eine Installation unter dem bisherigen Standard in der vorhandenen `.env` ergänzen:

```dotenv
COMPOSE_PROJECT_NAME=cs2-matchzy
```

Für vorhandene lokale Entwicklungsdaten in `.env.development` ergänzen:

```dotenv
COMPOSE_PROJECT_NAME=cs2-matchzy-dev
```

Bei einem eigenen Namen den tatsächlich verwendeten Wert eintragen. Coolify kann einen eigenen Projektnamen vorgeben; diesen erhalten. Die API bekommt den aufgelösten Compose-Projektnamen über `PLAYBOOK_COMPOSE_PROJECT_NAME` und sucht damit nach dem zugehörigen CS2-Container. Das Entwicklungsskript berücksichtigt `COMPOSE_PROJECT_NAME` ebenfalls.

Vor dem Update MongoDB, Uploads und CS2-Daten nach dem eigenen Backup-Verfahren sichern. Beide Images aus demselben Stand bauen und neu erstellen:

```bash
docker compose up -d --build
```

Die Umbenennung benötigt kein `down -v` und keinen Datenbank-Reset. Wer auch vorhandene Docker-Ressourcen auf einen neuen Namen umstellen möchte, muss ihre Volumes separat übertragen und prüfen. Dafür nicht einfach die Namensvariable entfernen. Die Rangfolge der Projektnamen ist in der [Compose-Dokumentation](https://docs.docker.com/compose/how-tos/project-name/) beschrieben.

## Server-Plugin

Beim nächsten CS2-Start installiert der Bootstrap `Playbook.dll` nach `addons/counterstrikesharp/plugins/Playbook/`.

Findet er `plugins/MatchZyNades/`, kopiert er dessen `data/` einschließlich Spielereinstellungen und Favoriten in das neue Plugin-Verzeichnis. Bereits vorhandene Playbook-Dateien haben Vorrang. Anschließend verschiebt er das komplette alte Plugin nach `addons/counterstrikesharp/playbook-migration/MatchZyNades.<ID>/`. Dort lädt CounterStrikeSharp die alte DLL nicht zusätzlich. Das Archiv enthält auch bei Namenskonflikten die alten Originaldateien. Weitere Starts wiederholen die Migration nicht.

Die API erzeugt den Lineup-Export für den Bootstrap als `/runtime/playbook-lineups.json`. API und CS2 müssen deshalb gemeinsam aktualisiert werden. Die alte Runtime-Datei darf im Volume liegen bleiben, wird aber nicht mehr verwendet. Die gemeinsame Live-Bibliothek bleibt am bisherigen Pfad.

Nach dem Start im Dashboard die Plugin-Diagnose prüfen. Playbook muss als geladen erscheinen. Anschließend mit einem vorhandenen Spieler dessen Favoriten und Einstellungen prüfen und zwischen Nades und MatchZy wechseln.

## HUD und Windows-App

Das neue Plugin lädt `panorama/layout/custom_game/playbook_training.xml`. Dafür müssen die neu kompilierten Client-Dateien vorhanden sein. Die alten `matchzy_training`-Dateien genügen für Plugin 2.4.0 nicht.

1. CS2 auf dem Client vollständig beenden.
2. `hud.cmd` für ein lokales Update ausführen oder dem [Workshop-Release-Ablauf](../training-hud/workshop-release.md) folgen. Das Build-Addon heißt jetzt `playbook_training_hud`. Das bestehende Workshop-Item `3810441722` aktualisieren und seine ID erhalten.
3. Für Mitspieler das neue Workshop-Paket vor dem Serverwechsel bereitstellen. Lokale Tests benötigen die beiden neuen Overrides.
4. CS2 neu starten und `.nades` öffnen. Neun Listenplätze, Mausbedienung, Favoriten und Review-Aufnahme prüfen.

`panel-source.ps1 local` und `live` sichern vorhandene lokale Dateien unter `<CS2>/playbook-hud-backups/<ID>/`. Dabei werden auch die beiden alten `matchzy_training`-Overrides gesichert und entfernt. Der reine Statusaufruf verändert keine Dateien. Die optionale Bind-CFG heißt nun `playbook_training.cfg`; die darin verwendeten Spielbefehle bleiben gleich.

Desktop-Version 0.1.10 verwendet das neue GitHub-Ziel. App-ID, Protokoll, Benutzerdaten und Installer-Name bleiben Playbook. Der neue Installer wird erst durch einen eigenen Desktop-Release veröffentlicht. Ein Quellcode-Update veröffentlicht weder einen Windows-Installer noch ein Workshop-Paket.

## Verbleibende Kompatibilitätsnamen

| Name | Grund |
| --- | --- |
| `cfg/MatchZy/savednades.json` und ihre Begleitdateien | Gemeinsame Live-Bibliothek für beide Modi; erhält vorhandene Lineups und das externe Dateiformat. |
| `matchzy-admins.json`, MatchZy-Konfiguration und Cvars | Schnittstellen des externen MatchZy-Plugins. |
| `matchZyChatPrefix` im Settings-Dokument | Bestehendes Konfigurationsfeld für den gemeinsamen Chat-Präfix; eigene Präfixe bleiben erhalten. |
| `cs2_admin_panel`, `ADMIN_PANEL_*`, `admin_panel_*` | Bestehende Datenbank, Deployment-Variablen und Volume-Schlüssel; ein Austausch wäre eine zusätzliche Datenmigration. |
| `nades`, `.nades`, `css_training*` | Gespeicherte Modus-ID und vorhandene Spielerbefehle beziehungsweise Binds. |
| `cs2-matchzy` und `MatchZyNades` in der Migration | Ausschließlich Erkennung und Erhalt bestehender Installationen. |

Diese Namen beschreiben Datenformate und Schnittstellen. Das Projekt, seine eigenen Builds und die Oberfläche heißen Playbook.
