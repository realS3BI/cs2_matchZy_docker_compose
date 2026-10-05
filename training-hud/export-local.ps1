#Requires -Version 7.0
param()
$ErrorActionPreference = 'Stop'
$dist = Join-Path $PSScriptRoot 'dist'
$relativeFiles = @(
    'panorama/layout/custom_game/playbook_training.vxml_c',
    'panorama/styles/custom_game/playbook_training.vcss_c'
)
foreach ($relative in $relativeFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $dist $relative) -PathType Leaf)) {
        throw "Kompilierte HUD-Datei fehlt: $relative. Zuerst hud.cmd auf Windows ausführen."
    }
}
$package = Join-Path $dist 'Playbook-HUD-local'
$zip = Join-Path $dist 'Playbook-HUD-local.zip'
if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package -Recurse -Force }
New-Item -ItemType Directory -Path $package | Out-Null
foreach ($relative in $relativeFiles) {
    $target = Join-Path $package "game/csgo/$relative"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $dist $relative) -Destination $target
}
# Windows PowerShell 5.1 needs a BOM to read German UTF-8 strings correctly.
foreach ($name in @('install-local.ps1', 'panel-source.ps1')) {
    [IO.File]::WriteAllText((Join-Path $package $name), (Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) -Raw), [Text.UTF8Encoding]::new($true))
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-local.cmd') -Destination (Join-Path $package 'Installieren.cmd')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'local-package-readme.txt') -Destination (Join-Path $package 'Liesmich.txt')
Compress-Archive -LiteralPath $package -DestinationPath $zip -Force
Write-Output "Lokales HUD zum Weitergeben: $zip"
Write-Output "Oder diesen Ordner senden: $package"
