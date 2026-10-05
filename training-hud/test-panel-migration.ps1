#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('playbook-hud-migration-' + [guid]::NewGuid().ToString('N'))
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function global:Get-Process { [CmdletBinding()]param([string]$Name) }
try {
    $hud = Join-Path $fixture 'training-hud'
    $cs2 = Join-Path $fixture 'cs2'
    $game = Join-Path $cs2 'game/csgo'
    New-Item -ItemType Directory -Force -Path $hud, $game | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'panel-source.ps1') -Destination $hud
    foreach ($part in @(@('layout', 'vxml_c'), @('styles', 'vcss_c'))) {
        $relative = "panorama/$($part[0])/custom_game"
        $local = Join-Path $game $relative
        $built = Join-Path $hud "dist/$relative"
        New-Item -ItemType Directory -Force -Path $local, $built | Out-Null
        'old' | Set-Content -LiteralPath (Join-Path $local "matchzy_training.$($part[1])")
        'new' | Set-Content -LiteralPath (Join-Path $built "playbook_training.$($part[1])")
        'unrelated' | Set-Content -LiteralPath (Join-Path $local "another_hud.$($part[1])")
    }
    $script = Join-Path $hud 'panel-source.ps1'
    $before = @(& $script status -Cs2 $cs2) -join "`n"
    Assert ($before -match 'Alte MatchZy-HUD-Dateien') 'Status muss alte Overrides erkennen.'
    Assert (-not (Test-Path (Join-Path $cs2 'playbook-hud-backups'))) 'Status darf keine Dateien verändern.'
    & $script local -Cs2 $cs2 -SkipBuild
    foreach ($part in @(@('layout', 'vxml_c'), @('styles', 'vcss_c'))) {
        $local = Join-Path $game "panorama/$($part[0])/custom_game"
        Assert (-not (Test-Path (Join-Path $local "matchzy_training.$($part[1])"))) 'Altes Override wurde nicht entfernt.'
        Assert ((Get-Content (Join-Path $local "playbook_training.$($part[1])")) -eq 'new') 'Neues HUD fehlt.'
        Assert ((Get-Content (Join-Path $local "another_hud.$($part[1])")) -eq 'unrelated') 'Fremdes HUD darf nicht verändert werden.'
    }
    $backups = @(Get-ChildItem (Join-Path $cs2 'playbook-hud-backups') -Recurse -File)
    Assert ($backups.Count -eq 2) 'Beide alten Dateien müssen gesichert werden.'
    foreach ($backup in $backups) { Assert ((Get-Content $backup.FullName) -eq 'old') 'Sicherung muss die Originaldaten enthalten.' }
    & $script live -Cs2 $cs2
    Assert (@(Get-ChildItem $game -Recurse -Filter 'playbook_training.*').Count -eq 0) 'Live muss die neuen Overrides entfernen.'
    Assert (@(Get-ChildItem $game -Recurse -Filter 'another_hud.*').Count -eq 2) 'Live muss andere HUDs erhalten.'
    Write-Output 'Playbook-HUD-Migration geprüft.'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item Function:\Get-Process -ErrorAction SilentlyContinue
}
