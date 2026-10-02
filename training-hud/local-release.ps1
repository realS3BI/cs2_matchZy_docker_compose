#Requires -Version 7.0
param(
    [Parameter(Position = 0)][ValidateSet('update', 'release', 'live', 'status')][string]$Mode = 'update',
    [string]$Cs2 = $env:CS2_PATH,
    [string]$SteamCmd = $env:STEAMCMD_PATH,
    [string]$SteamUsername = $env:STEAM_USERNAME
)
$ErrorActionPreference = 'Stop'
$localRoot = Join-Path $PSScriptRoot '.local'
$settingsPath = Join-Path $localRoot 'settings.json'
$settings = @{}
if (Test-Path -LiteralPath $settingsPath) {
    try { $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json -AsHashtable } catch {
        throw "Lokale Einstellungen sind ungültig. $settingsPath korrigieren oder entfernen."
    }
}

function Save-HudSettings {
    New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
    $settings | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding utf8NoBOM
}

function Read-HudValue([string]$Prompt, [string]$Default) {
    $answer = (Read-Host "$Prompt [$Default]").Trim()
    if ($answer) { return $answer }
    return $Default
}

function Find-Cs2 {
    if (-not $IsWindows) { return }
    $steam = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
    if (-not $steam) { $steam = Join-Path ${env:ProgramFiles(x86)} 'Steam' }
    $libraries = @($steam)
    $libraryFile = Join-Path $steam 'steamapps/libraryfolders.vdf'
    if (Test-Path -LiteralPath $libraryFile) {
        foreach ($match in [regex]::Matches((Get-Content -LiteralPath $libraryFile -Raw), '"path"\s*"([^"]+)"')) {
            $libraries += $match.Groups[1].Value.Replace('\\', '\')
        }
    }
    foreach ($library in $libraries) {
        $candidate = Join-Path $library 'steamapps/common/Counter-Strike Global Offensive'
        if (Test-Path -LiteralPath (Join-Path $candidate 'game/csgo') -PathType Container) { return $candidate }
    }
}

function Wait-ForCs2Exit {
    while (Get-Process -Name cs2 -ErrorAction SilentlyContinue) {
        if ((Read-Host 'CS2 vollständig beenden, dann Enter drücken. Mit q abbrechen').Trim() -eq 'q') {
            throw 'Abgebrochen. CS2 wurde nicht beendet.'
        }
    }
}

function Assert-LocalHud($Manifest) {
    foreach ($relative in $Manifest.assetHashes.Keys) {
        $installed = Join-Path $Cs2 "game/csgo/$relative"
        if (-not (Test-Path -LiteralPath $installed -PathType Leaf) -or (Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne $Manifest.assetHashes[$relative]) {
            throw 'Lokales HUD stimmt nicht mit dem vorbereiteten Release überein. hud.cmd starten und das HUD erneut aktualisieren.'
        }
    }
}

if (-not $Cs2) { $Cs2 = $settings.cs2 }
if (-not $Cs2 -or -not (Test-Path -LiteralPath (Join-Path $Cs2 'game/csgo') -PathType Container)) {
    $Cs2 = Read-HudValue 'CS2-Installationsverzeichnis' (Find-Cs2)
}
if (-not $Cs2 -or -not (Test-Path -LiteralPath (Join-Path $Cs2 'game/csgo') -PathType Container)) {
    throw 'CS2-Verzeichnis nicht gefunden. Den Steam-Installationsordner mit game/csgo angeben.'
}
$Cs2 = (Resolve-Path -LiteralPath $Cs2).Path
$settings.cs2 = $Cs2
Save-HudSettings

if ($Mode -eq 'status') {
    & (Join-Path $PSScriptRoot 'panel-source.ps1') status -Cs2 $Cs2
    return
}
Wait-ForCs2Exit
if ($Mode -eq 'live') {
    & (Join-Path $PSScriptRoot 'panel-source.ps1') live -Cs2 $Cs2
    Write-Output 'Im Dashboard HUD über Workshop ausliefern mit ID 3810441722 aktivieren und Apply & restart ausführen.'
    return
}

if ($Mode -eq 'update') {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        throw '.NET 10 SDK fehlt. Installieren: winget install --id Microsoft.DotNet.SDK.10 --exact. Danach das Terminal neu öffnen.'
    }
    $sdks = & dotnet --list-sdks
    if ($LASTEXITCODE -ne 0 -or -not ($sdks -match '^10\.')) {
        throw '.NET 10 SDK fehlt. Installieren: winget install --id Microsoft.DotNet.SDK.10 --exact. Danach das Terminal neu öffnen.'
    }
    & (Join-Path $PSScriptRoot 'release.ps1') -Cs2 $Cs2
    & (Join-Path $PSScriptRoot 'panel-source.ps1') local -Cs2 $Cs2 -SkipBuild
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dist/release.json') -Raw | ConvertFrom-Json -AsHashtable
    Assert-LocalHud $manifest
    Write-Output 'Panorama-Panel aktualisiert und geprüft. Im Dashboard Trainings-HUD aktivieren und HUD über Workshop ausliefern ausschalten; Änderungen mit Apply & restart übernehmen.'
    Write-Output 'Playbook wird jetzt gebaut und geöffnet. Für den Review dort Server → Reviews öffnen und CS2 starten.'
    $global:LASTEXITCODE = 0
    & (Join-Path (Split-Path -Parent $PSScriptRoot) 'playbook-desktop/build-and-run.ps1') -LaunchDirect
    if ($LASTEXITCODE -ne 0) { throw 'Playbook konnte nicht gebaut oder geöffnet werden. Das Panorama-Panel ist bereits aktualisiert; die Fehlermeldung steht oben.' }
    Write-Output 'Fertig. Panorama-Panel und Playbook sind aktualisiert. Für einen späteren Workshop-Upload hud.cmd -Mode release verwenden.'
    return
}

# Check the prepared package and the installed overrides before asking to publish.
& (Join-Path $PSScriptRoot 'release.ps1') -Cs2 $Cs2 -SkipBuild
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dist/release.json') -Raw | ConvertFrom-Json -AsHashtable
Assert-LocalHud $manifest
Write-Output "Vorbereiteter Commit: $($manifest.commit). Workshop-Item: 3810441722."
if ((Read-Host 'Diesen HUD-Stand auch im Steam Workshop veröffentlichen? [j/N]').Trim() -notin @('j', 'ja')) {
    Write-Output 'Fertig. Lokales HUD aktualisiert, nichts hochgeladen. Später mit hud.cmd -Mode release denselben Stand veröffentlichen.'
    return
}
Wait-ForCs2Exit
Assert-LocalHud $manifest
$changeNote = Read-HudValue 'Änderungsnotiz, einzeilig' 'Trainingspanel aktualisiert'
if ($changeNote -match '[\x00-\x1f\x7f]') { throw 'Die Änderungsnotiz darf keine Steuerzeichen oder Zeilenumbrüche enthalten.' }
$visibility = Read-HudValue 'Sichtbarkeit: public, keep, friends, private oder unlisted' $(if ($settings.visibility) { $settings.visibility } else { 'public' })
if ($visibility -notin @('public', 'keep', 'friends', 'private', 'unlisted')) { throw 'Unbekannte Workshop-Sichtbarkeit.' }
if (-not $SteamUsername) { $SteamUsername = $settings.steamUsername }
if (-not $SteamUsername) { $SteamUsername = Read-HudValue 'Steam-Anmeldename des Workshop-Erstellers' '' }
if ($SteamUsername -notmatch '^[A-Za-z0-9_]+$') { throw 'Steam-Anmeldenamen angeben, nicht Anzeigename oder Steam64-ID.' }

$defaultSteamCmd = Join-Path $localRoot 'steamcmd/steamcmd.exe'
if (-not $SteamCmd) { $SteamCmd = $settings.steamCmd }
if (-not $SteamCmd) { $SteamCmd = $defaultSteamCmd }
if (-not (Test-Path -LiteralPath $SteamCmd -PathType Leaf)) {
    if ($SteamCmd -ne $defaultSteamCmd) { throw "SteamCMD nicht gefunden: $SteamCmd. Mit -SteamCmd den richtigen Pfad angeben." }
    Write-Output 'SteamCMD wird von Valve heruntergeladen und lokal eingerichtet.'
    $zip = Join-Path $localRoot 'steamcmd.zip'
    Invoke-WebRequest 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' -OutFile $zip
    Expand-Archive -LiteralPath $zip -DestinationPath (Split-Path -Parent $SteamCmd) -Force
    Remove-Item -LiteralPath $zip
}
$SteamCmd = (Resolve-Path -LiteralPath $SteamCmd).Path
$settings.steamCmd = $SteamCmd
$settings.steamUsername = $SteamUsername
$settings.visibility = $visibility
Save-HudSettings

Write-Output 'SteamCMD meldet dich an. Passwort und Steam Guard bei Bedarf direkt dort eingeben; das Skript speichert diese Eingaben nicht.'
Push-Location (Split-Path -Parent $SteamCmd)
try {
    # Keep stdout and stdin attached to the terminal so login prompts remain visible.
    & $SteamCmd +@ShutdownOnFailedCommand 1 +login $SteamUsername +quit
    if ($LASTEXITCODE -ne 0) { throw 'Steam-Anmeldung fehlgeschlagen. Erneut mit hud.sh release versuchen.' }
} finally { Pop-Location }
& (Join-Path $PSScriptRoot 'release.ps1') -Cs2 $Cs2 -SkipBuild -Publish -SteamCmd $SteamCmd -SteamUsername $SteamUsername -Visibility $visibility -ChangeNote $changeNote
Write-Output 'Release abgeschlossen. Für den Test der Workshop-Version hud.cmd -Mode live ausführen und die Workshop-Auslieferung im Dashboard aktivieren.'
