# An Playbook mitarbeiten

Die [Projektregeln](AGENTS.md) gelten für Code, Oberfläche und Dokumentation. Eigene Komponenten heißen Playbook. MatchZy bleibt der Name der externen Integration. Deutsche Texte verwenden UTF-8 und die korrekten Umlaute. Daten, Befehle und technische Bezeichner nicht pauschal ersetzen.

## Umgebung

`./dev.sh` oder `node dev.mjs` startet MongoDB, API und Demo-Worker in Docker und Vite direkt auf dem Rechner; Turborepo zeigt jeden Dienst in einem eigenen Bereich. Details zu Steam-Anmeldung und LAN-Adressen stehen im [README](README.md#lokal-starten). Die lokale Umgebung enthält keinen CS2-Server.

Für die Prüfungen außerhalb von Docker werden Node.js ab 22, pnpm 10.12.1, .NET SDK 10 und PowerShell 7 benötigt. Die Bootstrap-Tests benötigen Bash ab 4 sowie `jq`; Video-Tests benötigen `ffmpeg`. Die vorinstallierte Bash 3 von macOS reicht für die Bootstrap-Tests nicht aus.

## Prüfungen

Website und API:

```bash
cd admin-panel
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Server-Plugin vom Repository-Verzeichnis aus:

```bash
dotnet test server-plugin/Playbook.Tests/Playbook.Tests.csproj --configuration Release
dotnet publish server-plugin/Playbook/Playbook.csproj --configuration Release --output /tmp/playbook-plugin
```

Ohne lokales .NET SDK führt das Docker-Build dieselben Plugin-Tests aus:

```bash
docker build --target playbook-tests -f cs2/Dockerfile -t playbook-tests .
```

Desktop-Logik und HUD-Skripte:

```bash
cd playbook-desktop
npm ci
npm test
```

```powershell
pwsh -File training-hud/test-release.ps1
pwsh -File training-hud/test-local-release.ps1
pwsh -File training-hud/test-update-local.ps1
pwsh -File training-hud/test-panel-migration.ps1
```

Die HUD-Skripttests simulieren Compiler und Steam. Die tatsächliche Darstellung, Client-Assets, Würfe, Kamera und Mehrspielerabläufe benötigen einen echten CS2-Client. Der [HUD-Release-Ablauf](training-hud/workshop-release.md) beschreibt die Prüfung auf Windows. Der Desktop-Workflow baut den Windows-Installer und prüft das native Hilfsprogramm.

## Änderungen ausliefern

Änderungen an Website, API oder Bootstrap benötigen neue Docker-Images. Das Plugin wird im CS2-Image gebaut und bei jedem Start installiert. Änderungen am Panorama-Layout benötigen zusätzlich einen lokalen HUD-Build oder ein Update des bestehenden Workshop-Items.

Für Desktop-Releases die Version in `playbook-desktop/package.json` und `package-lock.json` gemeinsam erhöhen. Der Tag `playbook-v<Version>` startet den Windows-Release-Workflow. Ein Pull Request baut und prüft den Installer, veröffentlicht aber keinen Release.

Änderungen an Speicherpfaden müssen eine Migration und eine Prüfung mit bestehenden Daten enthalten. Die [Kompatibilitätsnamen](docs/migration-playbook.md#verbleibende-kompatibilitätsnamen) sind keine Aufforderung zu weiteren Suchen-und-Ersetzen-Aktionen.
