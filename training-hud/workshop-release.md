# Trainingspanel im Steam Workshop aktualisieren

Dieses Projekt aktualisiert das vorhandene [Workshop-Item 3810441722](https://steamcommunity.com/sharedfiles/filedetails/?id=3810441722). Kein neues Item anlegen, sonst müssten alle Server auf eine andere ID umgestellt werden. Laut bisherigem Screenshot heißt es „MatchZy Training HUD“ und ist nur für Freunde sichtbar. Für die allgemeine Nutzung auf **Öffentlich** stellen.

Es gibt zwei getrennte Updates:

- **Dashboard und Server-Plugin:** Rollen, Menüs, Favoriten und Aktionen. In Coolify beide Images aus dem neuen Commit neu bauen und bereitstellen. Der CS2-Build kompiliert das Plugin selbst. Mit „Apply & restart“ die gespeicherten Einstellungen übernehmen.
- **Workshop-Addon:** die kompilierten Panorama-Dateien für Layout und Styles. Das Addon nach Änderungen an XML/CSS neu hochladen. Ein Git-Commit oder Server-Neustart veröffentlicht es nicht.

Die Rolle Trainingsspieler ist in diesem Playbook-Stand enthalten. Sie öffnet das Panel im eigenständigen Nades-Training oder in MatchZy Practice mit `.nades`, ohne Binds. Im Dashboard unter „Benutzer“ anhand der Steam64-ID zuweisen. Neue Anmeldungen bleiben Player. Das Panel bleibt kompakt mit neun Listenplätzen.

## Sofortiger Weg über die Workshop Tools

1. Auf dem Windows-Rechner den neuen Commit holen und CS2 einschließlich Workshop Tools aktualisieren. CS2 vollständig beenden.
2. Im Projektordner in PowerShell bauen, mit dem tatsächlichen Installationspfad:

   ```powershell
   ./training-hud/build.ps1 -Cs2 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive'
   ```

3. In den CS2 Workshop Tools das bestehende Addon `matchzy_training_hud` öffnen. Im Asset Browser unter **Tools → Counter-Strike 2 Workshop Manager** den bestehenden Eintrag mit ID **3810441722** bearbeiten und aktualisieren. Die neuen kompilierten Dateien liegen bereits unter `game/csgo_addons/matchzy_training_hud/panorama/`. Keine neue Submission erstellen. Vor dem Hochladen kontrollieren, dass der Manager diese neuen Dateien einpackt.
4. Änderungsnotiz eintragen und hochladen. Steam muss den erfolgreichen Upload bestätigen. Eine eventuell verlangte Workshop-Vereinbarung oder Bestätigung mit dem Erstellerkonto abschließen.
5. Auf der Workshop-Seite unter Besitzerverwaltung Titel und Beschreibung korrigieren und die Sichtbarkeit auf **Öffentlich** stellen. Eine Inhaltsaktualisierung hebt „Nur Freunde“ nicht automatisch auf. Anschließend die Seite ohne angemeldetes Erstellerkonto öffnen und den Download mit einem anderen Spieler prüfen.

Als Titel „Playbook Training HUD“ verwenden. Titel, Beschreibung und Vorschaubild ändern die Workshop-ID nicht. Das Vorschaubild bei Bedarf mit `create-workshop-preview.ps1` neu erzeugen oder im Workshop Manager ersetzen.

Vorschlag für die Beschreibung:

```text
Trainingspanel für CS2-Communityserver mit Playbook und MultiAddonManager.

Zeigt Granaten-Lineups, persönliche Favoriten und Trainingswerkzeuge in einem kompakten Panel. Der Server liefert Menüs und Funktionen. Mit einer freigeschalteten Rolle im Practice-Modus .nades in den Chat eingeben und das Panel mit der Maus bedienen.

Dieses Addon enthält Client-Dateien, keine spielbare Map und keinen eigenständigen Trainingsmodus. Es benötigt einen Server mit kompatiblem Playbook-Plugin und MultiAddonManager. Spieler brauchen keine Workshop Tools. Zusätzliche Tastaturbelegungen sind freiwillig und müssen lokal eingerichtet werden.

Communityprojekt, keine offizielle Valve-Veröffentlichung.
```

## Manueller GitHub-Actions-Workflow

Datei: [training-hud-release.yml](../.github/workflows/training-hud-release.yml). Der Workflow reagiert ausschließlich auf `workflow_dispatch`. Er läuft weder bei Push noch bei Pull Requests automatisch.

Er kompiliert die zwei HUD-Dateien mit Valves `resourcecompiler.exe`, packt sie mit der fest versionierten ValvePak-Bibliothek als `3810441722.vpk` und prüft die Dateiinhalte nach erneutem Öffnen des Pakets. Optional aktualisiert SteamCMD das bestehende Workshop-Item. Das Workflow-Artefakt enthält die kompilierten Dateien, das VPK und `release.json` mit Commit und SHA-256. Es enthält keine Steam-Anmeldedaten und kein Server-Plugin.

### Einmalige Einrichtung auf Windows

Ein eigener **Windows-X64-Runner** mit dem zusätzlichen Label **cs2-workshop** ist erforderlich. Der Workflow installiert .NET 10; die folgenden Komponenten müssen bereits vorhanden sein:

1. Git, PowerShell 7 und CS2 mit installierten Workshop Tools. Im CS2-Verzeichnis muss `game/bin/win64/resourcecompiler.exe` existieren. Das Addon `matchzy_training_hud` einmal in den Workshop Tools anlegen, falls dieser Rechner es noch nicht kennt.
2. Im GitHub-Repository unter **Settings → Actions → Runners → New self-hosted runner** einen Windows-X64-Runner registrieren. Das Label `cs2-workshop` ergänzen. Den Runner unter demselben Windows-Benutzer wie die Workshop Tools und die spätere SteamCMD-Anmeldung starten. Der Rechner muss beim Workflow-Start eingeschaltet und der Runner online sein.
3. Unter **Settings → Secrets and variables → Actions → Variables** die Repository-Variable `CS2_PATH` setzen, zum Beispiel `D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive`.

Für automatischen Upload zusätzlich:

4. [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD) in einem beständigen Verzeichnis installieren, beispielsweise `C:/steamcmd`. Repository-Variable `STEAMCMD_PATH` auf `C:/steamcmd/steamcmd.exe` setzen.
5. Als Repository-Secret `STEAM_USERNAME` den Steam-Anmeldenamen des **Erstellerkontos** hinterlegen, nicht den Anzeigenamen und nicht die Steam64-ID.
6. SteamCMD auf dem Runner-Rechner einmal interaktiv unter dessen Windows-Benutzer anmelden:

   ```powershell
   Set-Location 'C:/steamcmd'
   ./steamcmd.exe
   # In SteamCMD:
   login DEIN_STEAM_ANMELDENAME
   # Passwort und Steam Guard nur in dieser lokalen Sitzung beantworten.
   quit
   ```

   Anschließend lokal `./steamcmd.exe +@NoPromptForPassword 1 +login DEIN_STEAM_ANMELDENAME +quit` ausführen. Erst wenn die gespeicherte Anmeldung ohne Rückfrage funktioniert, kann der Workflow sie verwenden. Die Anmeldung im normalen Steam-Client ersetzt diesen Schritt nicht. Läuft die Sitzung ab oder fordert Steam Guard erneut eine Bestätigung, lokal wiederholen. Der Workflow kann diese Rückfrage nicht beantworten und bricht ab.

Der Runner enthält damit eine gespeicherte Steam-Anmeldung. Nur eigene, geprüfte Commits ausführen. Die Anmeldung gehört weder ins Repository noch in ein Workflow-Artefakt.

### Workflow starten

1. Den Commit auf GitHub pushen. Für den Button **Run workflow** muss die YAML-Datei auf dem Standardbranch `main` liegen.
2. **Actions → Trainingspanel veröffentlichen → Run workflow** öffnen und den gewünschten Branch auswählen.
3. Für den ersten Probelauf `publish` ausgeschaltet lassen. Das erzeugt das Artefakt ohne Upload.
4. Für die Veröffentlichung erneut starten und `publish` einschalten. `visibility` auf `public` setzen, wenn das derzeitige „Nur Freunde“ aufgehoben werden soll. `keep` erhält den bisherigen Wert. `unlisted` bedeutet über Link erreichbar, aber nicht in der Suche gelistet. `friends` und `private` eignen sich nicht für die allgemeine Auslieferung.
5. Einzeilige Änderungsnotiz eintragen. Erfolg im SteamCMD-Schritt und Änderungsdatum auf der Workshop-Seite prüfen. Titel, Beschreibung und Vorschaubild bleiben im Workflow unverändert und werden über Steam bearbeitet.

Ein abgebrochener Upload kann bereits Daten an Steam übertragen haben. Vor einem erneuten Versuch die Workshop-Seite prüfen. Bei einem reinen Login-Fehler ist das gebaute Artefakt weiterhin verfügbar, sofern der Build erfolgreich war. Wenn Steam den Upload für App 730 oder das Erstellerkonto ablehnt, denselben Stand über den Workshop Manager veröffentlichen. Ein echter Upload aus diesem neuen Workflow ist noch nicht abgenommen.

Das Release-Skript funktioniert auch ohne GitHub Actions, mit PowerShell 7 und .NET 10:

```powershell
./training-hud/release.ps1 -Cs2 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive'
./training-hud/release.ps1 -Cs2 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive' -Publish -SteamCmd 'C:/steamcmd/steamcmd.exe' -SteamUsername 'DEIN_STEAM_ANMELDENAME' -Visibility public -ChangeNote 'Kompaktes Trainingspanel aktualisiert'
```

Die erste Zeile baut nur, die zweite baut erneut und lädt hoch. Das generierte `dist/workshop-upload.vdf` verwendet absolute Pfade und gilt nur auf dem Rechner, der es erzeugt hat. Das Upload-Verzeichnis enthält ausschließlich das VPK, keine losen XML-/CSS-Quellen oder lokalen Entwicklungsdateien.

## Auf dem Server aktivieren und mit anderen testen

1. Dashboard und CS2-Image auf den neuen Commit bringen. Unter **Server → Trainings-HUD** sowohl **Trainings-HUD aktivieren** als auch **HUD über Workshop ausliefern** einschalten und **3810441722** hinterlegen. Mit **Apply & restart** übernehmen. Der Bootstrap trägt die ID in `mm_client_extra_addons` ein.
2. Den Modus **Nades** verwenden oder als Admin/Match Admin mit `.prac` Practice starten. Dem Testspieler im Dashboard die Rolle **Trainingsspieler** geben.
3. Auf Entwicklungsclients CS2 beenden und lokale Overrides entfernen:

   ```powershell
   ./training-hud/panel-source.ps1 live -Cs2 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive'
   ```

   Das Skript sichert und entfernt nur die zwei lokalen HUD-Dateien. Sie würden sonst das Workshop-Addon überdecken.
4. CS2 normal über Steam starten, nicht über Launch Tools. Mit einem zweiten Spieler testen, der keine lokalen HUD-Dateien hat und nicht mit dem Workshop-Ersteller befreundet ist. Er muss das öffentliche Addon herunterladen können. Für die Überprüfung kann er es zusätzlich auf der Workshop-Seite abonnieren.
5. Server betreten, Team wählen, spawnen und `.nades` eingeben. Ohne Binds neun Listenplätze, Mausnavigation, Lineup laden, Favoriten und Ausblenden prüfen. Mit `.nades` wieder öffnen. Im Web darf Trainingsspieler nur Maps und Lineups sehen; Serverseiten und Schreibzugriffe müssen gesperrt sein.

Nach einem Workshop-Update CS2 vollständig neu starten und erneut verbinden. Bleibt ein altes Layout sichtbar, lokale Overrides und den Workshop-Download prüfen. Ein erfolgreicher Upload allein beweist noch nicht, dass jeder Client das neue Addon geladen hat.

Quellen: [Valve zur Aktualisierung bestehender Workshop-Items mit SteamCMD](https://partner.steamgames.com/doc/features/workshop/implementation#SteamCmd), [GitHub zum manuellen Workflow-Start](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [ValvePak zum Erstellen und Prüfen von VPKs](https://github.com/ValveResourceFormat/ValvePak).
