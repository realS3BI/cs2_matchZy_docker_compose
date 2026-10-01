#Requires -Version 7.0
# Exercises the real wizard, release proof and local overrides with simulated compiler/Steam commands.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('hud-local-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action, [string]$Pattern) {
    try { & $Action | Out-Null } catch {
        Assert ($_.Exception.Message -match $Pattern) "Unerwarteter Fehler: $_"
        return
    }
    throw "Erwarteter Fehler fehlt: $Pattern"
}
function Set-Answers([string[]]$Answers) { $global:HudFlowAnswers = [Collections.Generic.Queue[string]]::new($Answers) }

try {
    foreach ($name in @('local-release.ps1', 'release.ps1', 'panel-source.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $fixture
    }
    foreach ($directory in @('layout', 'styles', 'cs2 with spaces/game/csgo')) {
        New-Item -ItemType Directory -Force -Path (Join-Path $fixture $directory) | Out-Null
    }
    'layout-source' | Set-Content -LiteralPath (Join-Path $fixture 'layout/matchzy_training.xml')
    'styles-source' | Set-Content -LiteralPath (Join-Path $fixture 'styles/matchzy_training.css')
    @'
param([string]$Cs2)
$global:HudFlowBuilds++
foreach ($part in @(@('layout', 'xml', 'vxml_c'), @('styles', 'css', 'vcss_c'))) {
    $target = Join-Path $PSScriptRoot "dist/panorama/$($part[0])/custom_game"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "$($part[0])/matchzy_training.$($part[1])") -Destination (Join-Path $target "matchzy_training.$($part[2])") -Force
}
'@ | Set-Content -LiteralPath (Join-Path $fixture 'build.ps1')
    @'
if ($args -contains '+workshop_build_item') {
    $global:HudFlowUploads++
    $global:HudFlowUploadArguments = $args
    Write-Output $global:HudFlowUploadOutput
    $global:LASTEXITCODE = 0
} else {
    $global:HudFlowLogins++
    $global:LASTEXITCODE = $global:HudFlowLoginExit
}
'@ | Set-Content -LiteralPath (Join-Path $fixture 'steamcmd.ps1')
    function global:dotnet {
        if ($args[0] -eq '--list-sdks') { '10.0.100 [mock]'; $global:LASTEXITCODE = 0; return }
        $global:HudFlowPacks++
        [IO.File]::WriteAllText($args[-1], 'mock-vpk')
        $global:LASTEXITCODE = 0
    }
    function global:git { 'test-commit'; $global:LASTEXITCODE = 0 }
    function global:Get-Process {
        [CmdletBinding()]param([string]$Name)
        if ($Name -eq 'cs2' -and $global:HudFlowRunning) { [pscustomobject]@{ ProcessName = 'cs2' } }
    }
    function global:Start-Process {
        param([string]$FilePath)
        $global:HudFlowLaunches++
    }
    function global:Read-Host {
        param([string]$Prompt)
        if ($global:HudFlowAnswers.Count -eq 0) { throw "Unerwartete Rückfrage: $Prompt" }
        $answer = $global:HudFlowAnswers.Dequeue()
        if ($answer -eq 'j' -and $global:HudFlowMutateOnApproval) {
            'changed-during-test' | Set-Content -LiteralPath $global:HudFlowLocalAsset
        }
        return $answer
    }
    function global:Invoke-WebRequest {
        param([string]$Uri, [string]$OutFile)
        $global:HudFlowDownloadUrl = $Uri
        throw 'Test: Download fehlgeschlagen'
    }
    $global:HudFlowBuilds = 0
    $global:HudFlowPacks = 0
    $global:HudFlowLaunches = 0
    $global:HudFlowUploads = 0
    $global:HudFlowLogins = 0
    $global:HudFlowRunning = $false
    $global:HudFlowMutateOnApproval = $false
    $global:HudFlowLoginExit = 0
    $global:HudFlowUploadOutput = 'Success. Uploaded item to Workshop (PublishedFileID 3810441722).'
    $cs2 = Join-Path $fixture 'cs2 with spaces'
    $global:HudFlowLocalAsset = Join-Path $cs2 'game/csgo/panorama/layout/custom_game/matchzy_training.vxml_c'
    $script = Join-Path $fixture 'local-release.ps1'
    $parameters = @{ Cs2 = $cs2; SteamCmd = (Join-Path $fixture 'steamcmd.ps1'); SteamUsername = 'test_owner' }
    $proof = Join-Path $fixture 'dist/release.json'

    Set-Answers @()
    Expect-Failure { & $script @parameters -Mode release } 'Release-Nachweis fehlt'
    Assert ($global:HudFlowLogins -eq 0) 'Ohne Build darf keine Steam-Anmeldung starten.'

    Set-Answers @('n')
    & $script @parameters | Out-Null
    Assert ($global:HudFlowBuilds -eq 1 -and $global:HudFlowPacks -eq 1) 'Aktualisierung muss einmal bauen und packen.'
    Assert ($global:HudFlowLaunches -eq 0) 'Eine Aktualisierung darf CS2 nicht selbst starten.'
    Assert (Test-Path -LiteralPath $global:HudFlowLocalAsset) 'Lokales HUD wurde nicht installiert.'
    Assert ($global:HudFlowUploads -eq 0 -and $global:HudFlowLogins -eq 0) 'Abgelehnter Release darf Steam nicht aufrufen.'
    $prepared = Get-Content -LiteralPath $proof -Raw | ConvertFrom-Json
    $settingsPath = Join-Path $fixture '.local/settings.json'
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    Assert ($settings.cs2 -eq $cs2) 'CS2-Pfad wurde nicht gespeichert.'

    Set-Answers @('j', 'Größe kompakt geprüft', 'public')
    & $script @parameters -Mode release | Out-Null
    $published = Get-Content -LiteralPath $proof -Raw | ConvertFrom-Json
    Assert ($global:HudFlowBuilds -eq 1 -and $global:HudFlowPacks -eq 1) 'Späterer Release muss den getesteten Build wiederverwenden.'
    Assert ($global:HudFlowUploads -eq 1 -and $global:HudFlowLogins -eq 1) 'Release muss erst anmelden und dann hochladen.'
    Assert ($published.sha256 -eq $prepared.sha256 -and $published.builtAtUtc -eq $prepared.builtAtUtc) 'Veröffentlichtes Paket weicht vom getesteten Paket ab.'
    Assert ($published.visibility -eq 'public' -and $published.changeNote -eq 'Größe kompakt geprüft') 'Release-Metadaten wurden nicht übernommen.'
    Assert ((Get-Content -LiteralPath $settingsPath -Raw) -notmatch 'password|guard|token') 'Lokale Einstellungen dürfen keine Passwort-/Guard-Eingaben speichern.'

    $global:HudFlowMutateOnApproval = $true
    Set-Answers @('j')
    Expect-Failure { & $script @parameters -Mode release } 'Lokales HUD stimmt nicht'
    Assert ($global:HudFlowUploads -eq 1 -and $global:HudFlowLogins -eq 1) 'Nach Änderung während des Tests darf Steam nicht aufgerufen werden.'
    $global:HudFlowMutateOnApproval = $false
    Copy-Item -LiteralPath (Join-Path $fixture 'dist/panorama/layout/custom_game/matchzy_training.vxml_c') -Destination $global:HudFlowLocalAsset -Force

    Set-Answers @('n')
    & $script @parameters | Out-Null
    $global:HudFlowLoginExit = 1
    Set-Answers @('j', '', '')
    Expect-Failure { & $script @parameters -Mode release } 'Steam-Anmeldung fehlgeschlagen'
    Assert ($global:HudFlowUploads -eq 1) 'Nach fehlgeschlagenem Login darf nicht hochgeladen werden.'
    $global:HudFlowLoginExit = 0
    $global:HudFlowUploadOutput = 'ERROR! Upload failed'
    Set-Answers @('j', '', '')
    Expect-Failure { & $script @parameters -Mode release } 'Upload nicht bestätigt'
    $failed = Get-Content -LiteralPath $proof -Raw | ConvertFrom-Json
    Assert ($null -eq $failed.publishedAtUtc) 'Fehlgeschlagener Upload darf nicht als veröffentlicht gelten.'
    Assert (Test-Path -LiteralPath $global:HudFlowLocalAsset) 'Fehlgeschlagener Upload muss das lokale Test-HUD behalten.'

    # A first-time SteamCMD download must stop cleanly on network failure.
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json -AsHashtable
    $settings.Remove('steamCmd') | Out-Null
    $settings | ConvertTo-Json | Set-Content -LiteralPath $settingsPath
    $withoutSteam = @{ Cs2 = $cs2; SteamUsername = 'test_owner'; SteamCmd = '' }
    $logins = $global:HudFlowLogins
    Set-Answers @('j', '', '')
    Expect-Failure { & $script @withoutSteam -Mode release } 'Download fehlgeschlagen'
    Assert ($global:HudFlowDownloadUrl -eq 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip') 'SteamCMD muss direkt von Valve kommen.'
    Assert ($global:HudFlowLogins -eq $logins) 'Fehlgeschlagener Download darf keine Anmeldung starten.'

    Set-Answers @()
    $global:HudFlowRunning = $true
    & $script @parameters -Mode status | Out-Null
    Set-Answers @('q')
    $builds = $global:HudFlowBuilds
    Expect-Failure { & $script @parameters } 'Abgebrochen'
    Assert ($global:HudFlowBuilds -eq $builds) 'Bei laufendem CS2 darf kein Build starten.'
    $global:HudFlowRunning = $false
    Set-Answers @()
    & $script @parameters -Mode live | Out-Null
    Assert (-not (Test-Path -LiteralPath $global:HudFlowLocalAsset)) 'Live muss lokale Overrides entfernen.'
    Assert (@(Get-ChildItem -LiteralPath (Join-Path $cs2 'matchzy-hud-backups') -Recurse -File).Count -ge 2) 'Lokale Overrides müssen vor dem Entfernen gesichert werden.'
    Assert ($global:HudFlowBuilds -eq $builds) 'Live/Status dürfen keinen Build starten.'

    # Complete the default update-and-release flow, including the first username prompt.
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json -AsHashtable
    $settings.Remove('steamUsername') | Out-Null
    $settings | ConvertTo-Json | Set-Content -LiteralPath $settingsPath
    $global:HudFlowUploadOutput = 'Success. Uploaded item to Workshop (PublishedFileID 3810441722).'
    $uploads = $global:HudFlowUploads
    Set-Answers @('j', 'Alles im Spiel geprüft', '', 'test_owner')
    & $script -SteamCmd $parameters.SteamCmd | Out-Null
    Assert ($global:HudFlowBuilds -eq ($builds + 1) -and $global:HudFlowPacks -eq ($builds + 1)) 'Der vollständige Ablauf darf nur einmal vor der Release-Frage bauen.'
    Assert ($global:HudFlowUploads -eq ($uploads + 1)) 'Bestätigter Release muss den Upload ausführen.'
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    Assert ($settings.steamUsername -eq 'test_owner') 'Erstellerkonto muss für spätere Releases gespeichert werden.'
    Set-Answers @('j', '', '')
    & $script -Mode release | Out-Null
    Assert ($global:HudFlowUploads -eq ($uploads + 2) -and $global:HudFlowBuilds -eq ($builds + 1)) 'Gespeicherte Pfade und Anmeldung müssen ohne weitere Rückfragen wiederverwendet werden.'
    Assert ($global:HudFlowLaunches -eq 0) 'Auch eine bestätigte Veröffentlichung darf CS2 nicht automatisch starten.'
    Assert ($global:HudFlowAnswers.Count -eq 0) 'Nicht alle Testeingaben wurden verwendet.'
    Write-Output 'Lokaler Ablauf geprüft: bauen/installieren, Release ablehnen, optional veröffentlichen, Änderungen erkennen, Login-/Upload-/Download-Fehler und Live-Wechsel.'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    foreach ($name in @('dotnet', 'git', 'Get-Process', 'Start-Process', 'Read-Host', 'Invoke-WebRequest')) {
        Remove-Item -LiteralPath "Function:\$name" -ErrorAction SilentlyContinue
    }
    Get-Variable -Name HudFlow* -Scope Global | Remove-Variable -Scope Global
}
