param([Parameter(Mandatory = $true)][string]$Cs2)
$ErrorActionPreference = 'Stop'
$installRoot = (Resolve-Path -LiteralPath $Cs2).Path
$compiler = Join-Path $installRoot 'game/bin/win64/resourcecompiler.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'CS2 Workshop Tools fehlen: resourcecompiler.exe nicht gefunden. In CS2 installieren und Steam den Download abschliessen lassen.'
}
$sourceRoot = $PSScriptRoot
$addonContent = Join-Path $installRoot 'content/csgo_addons/matchzy_training'
$addonGame = Join-Path $installRoot 'game/csgo_addons/matchzy_training'
$dist = Join-Path $sourceRoot 'dist'
foreach ($part in @(@('styles', 'css', 'vcss_c'), @('layout', 'xml', 'vxml_c'))) {
    $source = Join-Path $sourceRoot "$($part[0])/matchzy_training.$($part[1])"
    $destination = Join-Path $addonContent "panorama/$($part[0])/custom_game"
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    & $compiler -i (Join-Path $destination "matchzy_training.$($part[1])") -r
    if ($LASTEXITCODE -ne 0) { throw "Panorama-Compiler fehlgeschlagen: $source" }
    $compiled = Join-Path $addonGame "panorama/$($part[0])/custom_game/matchzy_training.$($part[2])"
    if (-not (Test-Path -LiteralPath $compiled)) { throw "Compiler-Ausgabe fehlt: $compiled" }
    $output = Join-Path $dist "panorama/$($part[0])/custom_game"
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    Copy-Item -LiteralPath $compiled -Destination $output -Force
}
Write-Output "HUD kompiliert: $dist"
Write-Output 'Noch nicht installiert oder veroeffentlicht. Workshop-Addon aus game/csgo_addons/matchzy_training erstellen.'
