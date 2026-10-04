param([Parameter(Mandatory = $true)][string]$Cs2)
$ErrorActionPreference = 'Stop'
$installRoot = (Resolve-Path -LiteralPath $Cs2).Path
$compiler = Join-Path $installRoot 'game/bin/win64/resourcecompiler.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'CS2 Workshop Tools fehlen: resourcecompiler.exe nicht gefunden. In CS2 installieren und Steam den Download abschließen lassen.'
}
$sourceRoot = $PSScriptRoot
$addonName = 'playbook_training_hud'
$addonContent = Join-Path $installRoot "content/csgo_addons/$addonName"
$addonGame = Join-Path $installRoot "game/csgo_addons/$addonName"
$dist = Join-Path $sourceRoot 'dist'
foreach ($part in @(@('styles', 'css', 'vcss_c'), @('layout', 'xml', 'vxml_c'))) {
    $source = Join-Path $sourceRoot "$($part[0])/playbook_training.$($part[1])"
    $destination = Join-Path $addonContent "panorama/$($part[0])/custom_game"
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    $compiled = Join-Path $addonGame "panorama/$($part[0])/custom_game/playbook_training.$($part[2])"
    # Never accept an output left by an older compiler run.
    if (Test-Path -LiteralPath $compiled) { Remove-Item -LiteralPath $compiled }
    & $compiler -i (Join-Path $destination "playbook_training.$($part[1])") -r
    if ($LASTEXITCODE -ne 0) { throw "Panorama-Compiler fehlgeschlagen: $source" }
    if (-not (Test-Path -LiteralPath $compiled)) { throw "Compiler-Ausgabe fehlt: $compiled" }
    $output = Join-Path $dist "panorama/$($part[0])/custom_game"
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    Copy-Item -LiteralPath $compiled -Destination $output -Force
}
Write-Output "HUD kompiliert: $dist"
Write-Output "HUD-Dateien in Workshop-Addon '$addonName' abgelegt. Noch nicht veröffentlicht."
