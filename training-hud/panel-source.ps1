param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('local', 'live', 'status')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$Cs2,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$installRoot = (Resolve-Path -LiteralPath $Cs2).Path
$gameRoot = Join-Path $installRoot 'game/csgo'
if (-not (Test-Path -LiteralPath $gameRoot -PathType Container)) {
    throw "Kein CS2-Spielverzeichnis: $gameRoot"
}
$relativeFiles = @(
    'panorama/layout/custom_game/matchzy_training.vxml_c',
    'panorama/styles/custom_game/matchzy_training.vcss_c'
)
$present = @($relativeFiles | Where-Object { Test-Path -LiteralPath (Join-Path $gameRoot $_) -PathType Leaf })
if ($Mode -eq 'status') {
    if ($present.Count -eq 2) {
        Write-Output 'Local: Beide lokalen HUD-Dateien sind installiert.'
    } elseif ($present.Count -eq 0) {
        Write-Output 'Live: Keine lokalen HUD-Dateien installiert. Das Workshop-Addon muss vom Server bereitgestellt werden.'
    } else {
        Write-Output 'Unvollständig: Nur eine lokale HUD-Datei vorhanden. Mit local oder live korrigieren.'
    }
    Write-Output 'Status der Dateien auf der Festplatte; ein laufender Client kann noch die vorherige Version im Cache haben.'
    return
}
if (Get-Process -Name cs2 -ErrorAction SilentlyContinue) {
    throw 'CS2 zuerst vollständig beenden. Panorama hält das Layout während der Sitzung im Cache.'
}
if ($Mode -eq 'local') {
    if (-not $SkipBuild) { & (Join-Path $PSScriptRoot 'build.ps1') -Cs2 $installRoot }
    foreach ($relative in $relativeFiles) {
        $source = Join-Path $PSScriptRoot "dist/$relative"
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Kompilierte HUD-Datei fehlt: $source" }
    }
}

# Backups are outside game/csgo so CS2 cannot mount them as overrides.
$backup = Join-Path $installRoot ("matchzy-hud-backups/" + [guid]::NewGuid().ToString('N'))
foreach ($relative in $present) {
    $saved = Join-Path $backup $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $saved) | Out-Null
    Copy-Item -LiteralPath (Join-Path $gameRoot $relative) -Destination $saved
}
try {
    foreach ($relative in $relativeFiles) {
        $target = Join-Path $gameRoot $relative
        if ($Mode -eq 'local') {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot "dist/$relative") -Destination $target -Force
        } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
            Remove-Item -LiteralPath $target
        }
    }
} catch {
    # Restore the original pair, including an originally missing file.
    foreach ($relative in $relativeFiles) {
        $target = Join-Path $gameRoot $relative
        if ($present -contains $relative) {
            Copy-Item -LiteralPath (Join-Path $backup $relative) -Destination $target -Force
        } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
            Remove-Item -LiteralPath $target
        }
    }
    throw
}
if ($present.Count -gt 0) { Write-Output "Vorherige lokale Dateien gesichert: $backup" }
if ($Mode -eq 'local') {
    Write-Output 'Local aktiviert. CS2 jetzt normal über Steam starten.'
} else {
    Write-Output 'Lokale HUD-Dateien deaktiviert. CS2 normal über Steam starten; das HUD kommt aus dem vom Server bereitgestellten Workshop-Addon.'
    Write-Output 'Ohne veröffentlichtes und eingebundenes Workshop-Addon ist kein Live-HUD verfügbar.'
}
