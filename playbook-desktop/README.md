# Playbook für Windows

Die App enthält die vollständige Website unter `https://playbook.schlossers.at` und ergänzt den Medien-Review um lokale CS2-Steuerung. Website-Updates erscheinen ohne Neuinstallation. Neue Windows-Versionen werden im Hintergrund geladen; installiert wird erst über den Update-Button nach dem Review.

## Benutzen

1. Den Windows-Installer `Playbook-Setup-<Version>.exe` aus den GitHub-Releases installieren. Es sind keine Administratorrechte nötig.
2. Playbook öffnen und mit dem eigenen Steam-Konto anmelden. Die vorhandenen Berechtigungen gelten auch hier.
3. Beim Lineup den Medien-Review öffnen. CS2 über **CS2 mit lokaler Steuerung starten** starten. Wenn CS2 schon läuft, vorher regulär beenden. Der Button verwendet Steam mit der Startoption `-vconsole`.
4. Mit dem Trainingsserver verbinden. In CS2 vorzugsweise **Vollbild im Fenster** verwenden. **Spielbild verbinden** erkennt genau das CS2-Fenster; ein Bildschirm-Auswahldialog entfällt.
5. Die vier Fotos und das Video über die Website oder als Plattform-Admin über das bestehende Ingame-Panel aufnehmen. Das Server-Plugin steuert weiterhin Position, Frontkamera, Panel und Review-Schritte. Die App übernimmt HUD, Waffe, Fadenkreuz, Fensterausschnitt und Upload über die bestehende Website.
6. Das Video mit **F8** beenden. Dafür muss kein Bind in CS2 gespeichert werden. Nach dem Upload abschließend prüfen und einreichen bzw. als Plattform-Admin freigeben.

Bei Fotos wird ein kleines weißes, statisches CS2-Fadenkreuz mit schwarzer Kontur eingestellt. Es wird im Spiel gerendert und nicht auf das Foto gezeichnet. Frontfotos haben kein Fadenkreuz. Geldanzeige, HUD, Telemetrie und Viewmodel sind auf Fotos ausgeblendet. Videos behalten die Waffe, damit der Wurf sichtbar bleibt. Steam- und andere Fremd-Overlays müssen geschlossen sein. Ton wird nicht aufgenommen; das vorhandene Limit von zwei Minuten und 128 MB gilt weiter.

Die App liest alle Einstellungen, die sie verändert, und schreibt vor der Änderung eine lokale Wiederherstellungsdatei. Nach der Aufnahme stellt sie die gelesenen Werte wieder her und prüft sie. Bei einer Verbindungsunterbrechung bleibt die Sicherung erhalten; die App versucht die Wiederherstellung erneut. Ein ungeplanter Prozessabbruch lässt sich nicht synchron behandeln, deshalb wird beim nächsten App-Start aus der Datei wiederhergestellt. Die Datei und persönliche Fadenkreuzwerte werden nicht hochgeladen. Während einer Aufnahme Einstellungen nicht parallel in CS2 ändern.

Der eingebaute Desktop-Stil ist unabhängig vom manuell hinterlegten Share-Code der Browser-Variante. Der Browser-Review funktioniert weiterhin ohne Windows-App.

## Entwickeln und ausliefern

Voraussetzungen: Windows 10/11 x64, Node.js 22+, .NET SDK 10. Die App benötigt Internet für Playbook und UploadThing, Steam und einen laufenden Trainingsserver mit dem aktuellen Review-Plugin. `r_drawviewmodel` benötigt die auf dem Trainingsserver erlaubten Cheats; die App ändert keine globalen Serverregeln.

Für lokale Updates unter Windows genügt ein Doppelklick auf **[`playbook.cmd`](../playbook.cmd)** im Projekt-Root. Die Datei führt `git pull --ff-only` auf dem aktuellen Branch aus, installiert die Build-Abhängigkeiten, testet und baut den Windows-Installer und öffnet ihn anschließend. Nach der Installation startet Playbook automatisch. Vorher laufende Reviews beenden und Playbook schließen.

Git for Windows, Node.js 22 oder neuer inklusive npm und das **.NET SDK 10** müssen installiert sein. Das Skript verwendet die in Windows enthaltene PowerShell; PowerShell 7 ist dafür nicht nötig. Bei Fehlern bleibt das Fenster mit der Fehlermeldung offen. Ein fehlgeschlagenes Update oder ein Build-Fehler startet keinen älteren Installer.

Vor dem Build und vor der Installation schließt das Skript laufende Playbook-Fenster regulär und wartet bis zu 30 Sekunden auf das Ende aller Playbook-Prozesse. So kann die App ihre CS2-Einstellungen wiederherstellen. Falls Prozesse weiterlaufen oder bereits ein Installer offen ist, hält das Skript vor dem nächsten Schritt an und nennt die Blockade. Eine Rückfrage in Playbook muss gegebenenfalls noch beantwortet werden.

Erscheint bei einer älteren Version im Installer **„Playbook kann nicht geschlossen werden“**, zuerst den laufenden Review beenden und Playbook schließen. Bleiben danach Prozesse ohne sichtbares Fenster übrig, im Windows-Task-Manager unter **Details** die Prozesse `Playbook.exe` beenden und im Installer **Wiederholen** wählen. Playbook und das Update-Skript unter demselben Windows-Konto und normalerweise ohne Administratorrechte starten.

```powershell
cd playbook-desktop
npm ci
npm run build:native
npm start
# Installer, einschließlich Tests
npm run dist
```

Die GitHub-Aktion **Playbook für Windows** kann manuell gestartet werden. Sie erstellt einen Installer als Workflow-Artefakt, ohne ihn zu veröffentlichen. Für ein reguläres Update die Paketversion erhöhen, beide Paketdateien committen und einen passenden Tag pushen:

```sh
cd playbook-desktop
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Playbook-Version erhöhen"
git tag "playbook-v$(node -p 'require("./package.json").version')"
git push origin HEAD --tags
```

Ein Tag `playbook-v<Version>` baut den Installer auf Windows und veröffentlicht EXE, Blockmap und `latest.yml` gemeinsam als GitHub-Release. Bereits installierte Apps finden dieses Update automatisch. Website- und Plugin-Änderungen werden weiterhin über deren bestehenden Weg ausgerollt; sie stecken nicht im Installer. Vor dem ersten Einsatz muss die Website mit der Desktop-Anbindung veröffentlicht sein.

Optional die Repository-Secrets `WINDOWS_CSC_LINK` und `WINDOWS_CSC_KEY_PASSWORD` für ein Authenticode-Zertifikat hinterlegen. Ohne Zertifikat ist der Installer unsigniert; Windows kann beim ersten Start eine SmartScreen-Abfrage anzeigen. Es wird keine Signaturprüfung abgeschaltet. Für öffentliche Verteilung ist ein dauerhaft verwendeter Publisher sinnvoll.

## Grenzen und Prüfung

- Kein Zugriff auf CS2-Speicher, keine DLL-Injektion, keine Änderung an Steam-Konfigurationsdateien. Lokale Steuerung läuft ausschließlich über CS2s VConsole2 auf `127.0.0.1:29000`. Diesen Port nicht im Router oder in der Firewall für andere Rechner freigeben.
- Der Windows-Prozess liest nur Fenstergeometrie und Prozessidentität. Das Bild kommt aus Electron/Chromium-Fensteraufnahme. Bei unklarer Geometrie wird abgebrochen, statt einen Fensterrand zu schätzen. Minimiertes CS2 oder ein Größenwechsel während des Videos bricht die Aufnahme ab.
- Vor Verwendung in echten Reviews einmal auf Windows prüfen: Foto mit ungewöhnlichem persönlichen Fadenkreuz aufnehmen, HUD/Waffe/Fadenkreuz nach dem Foto vergleichen, Frontfoto prüfen, F8 im Spiel testen, CS2-Verbindung während eines Fotos unterbrechen und Wiederherstellung prüfen. Diese Interaktion lässt sich auf einem Mac nicht mit einem echten Windows-CS2 validieren.
- `npm test` prüft Paketfragmentierung und Konsolenantworten, verweigerte Einstellungen, exakte Wiederherstellung, Abbruch und Neustart, Herkunftsprüfung und Fensterausschnitte. Die Browser-Fixture `admin-panel/client/test/review-desktop.html` prüft den vollständigen Aufnahmeablauf mit simuliertem Spiel und der echten Review-Oberfläche.

Technische Referenzen: [Electron-Fensteraufnahme](https://www.electronjs.org/docs/latest/api/desktop-capturer), [Electron-Sicherheitsmodell](https://www.electronjs.org/docs/latest/tutorial/security), [electron-builder Auto-Update](https://www.electron.build/v26/docs/features/auto-update/), [VConsole2-Protokollreferenz](https://github.com/oxijoined/vconsole-python), [aktuelle CS2-Konsolenvariablen](https://github.com/SteamDatabase/GameTracking-CS2/blob/master/DumpSource2/convars.txt).
