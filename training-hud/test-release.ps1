#Requires -Version 7.0
# Offline contract tests. No Valve compiler, Steam account or network is used.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('hud-release-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action, [string]$Pattern) {
    try { & $Action | Out-Null } catch {
        Assert ($_.Exception.Message -match $Pattern) "Unerwarteter Fehler: $_"
        return
    }
    throw "Erwarteter Fehler fehlt: $Pattern"
}

try {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'release.ps1') -Destination $fixture
    foreach ($part in @('layout', 'styles')) {
        New-Item -ItemType Directory -Path (Join-Path $fixture $part) | Out-Null
    }
    'test-layout' | Set-Content -LiteralPath (Join-Path $fixture 'layout/playbook_training.xml')
    'test-styles' | Set-Content -LiteralPath (Join-Path $fixture 'styles/playbook_training.css')
    @'
param([string]$Cs2)
$global:ReleaseTestBuilds++
foreach ($part in @(@('layout', 'xml', 'vxml_c'), @('styles', 'css', 'vcss_c'))) {
    $target = Join-Path $PSScriptRoot "dist/panorama/$($part[0])/custom_game"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "$($part[0])/playbook_training.$($part[1])") -Destination (Join-Path $target "playbook_training.$($part[2])") -Force
}
'@ | Set-Content -LiteralPath (Join-Path $fixture 'build.ps1')
    @'
$global:ReleaseTestUploads++
$global:ReleaseTestArguments = $args
$global:LASTEXITCODE = $global:ReleaseTestSteamExit
Write-Output $global:ReleaseTestSteamOutput
'@ | Set-Content -LiteralPath (Join-Path $fixture 'steamcmd.ps1')
    function global:dotnet {
        $global:ReleaseTestPacks++
        [IO.File]::WriteAllText($args[-1], 'mock-vpk')
        $global:LASTEXITCODE = $global:ReleaseTestPackExit
    }
    function global:git { $global:LASTEXITCODE = 0; $global:ReleaseTestCommit }
    $global:ReleaseTestCommit = 'test-commit'
    $global:ReleaseTestBuilds = 0
    $global:ReleaseTestPacks = 0
    $global:ReleaseTestUploads = 0
    $global:ReleaseTestPackExit = 0
    $global:ReleaseTestSteamExit = 0
    $global:ReleaseTestSteamOutput = 'Success. Uploaded item to Workshop (PublishedFileID 3810441722).'
    $script = Join-Path $fixture 'release.ps1'
    $parameters = @{ Cs2 = $fixture; SteamCmd = (Join-Path $fixture 'steamcmd.ps1'); SteamUsername = 'test_owner' }
    $vdfPath = Join-Path $fixture 'dist/workshop-upload.vdf'

    Expect-Failure { & $script @parameters -SkipBuild } 'Release-Nachweis fehlt'
    & $script @parameters -ChangeNote 'Größe "kompakt" \ Test' | Out-Null
    Assert ($global:ReleaseTestUploads -eq 0) 'Build-only darf keinen Upload starten.'
    $vdf = Get-Content -LiteralPath $vdfPath -Raw
    Assert ($vdf -match '"appid" "730"' -and $vdf -match '"publishedfileid" "3810441722"') 'Falsches Workshop-Ziel.'
    Assert ($vdf -notmatch '"(?:visibility|title|description|previewfile)"') 'Keep darf Metadaten nicht überschreiben.'
    Assert ($vdf.Contains('Größe \"kompakt\" \\ Test')) 'VDF-Werte sind nicht escaped.'
    $manifest = Get-Content -LiteralPath (Join-Path $fixture 'dist/release.json') -Raw | ConvertFrom-Json
    Assert ($manifest.commit -eq 'test-commit' -and $manifest.sha256.Length -eq 64) 'Release-Nachweis fehlt.'

    & $script @parameters -Publish -Visibility public | Out-Null
    Assert ($global:ReleaseTestUploads -eq 1) 'Upload wurde nicht ausgeführt.'
    Assert ((Get-Content -LiteralPath $vdfPath -Raw) -match '"visibility" "0"') 'Öffentliche Sichtbarkeit fehlt.'
    Assert ($global:ReleaseTestArguments -contains '+workshop_build_item') 'SteamCMD-Upload-Befehl fehlt.'
    Assert ($global:ReleaseTestArguments -contains $vdfPath) 'SteamCMD verwendet das falsche VDF.'
    Assert ($global:ReleaseTestArguments -contains '+@NoPromptForPassword') 'Upload muss die zuvor abgeschlossene SteamCMD-Anmeldung verwenden.'

    $prepared = Get-Content -LiteralPath (Join-Path $fixture 'dist/release.json') -Raw | ConvertFrom-Json
    $builds = $global:ReleaseTestBuilds
    $packs = $global:ReleaseTestPacks
    & $script @parameters -Publish -SkipBuild -ChangeNote 'Getesteten Stand veröffentlichen' | Out-Null
    $published = Get-Content -LiteralPath (Join-Path $fixture 'dist/release.json') -Raw | ConvertFrom-Json
    Assert ($global:ReleaseTestBuilds -eq $builds -and $global:ReleaseTestPacks -eq $packs) 'Der getestete Stand darf nicht erneut gebaut werden.'
    Assert ($published.sha256 -eq $prepared.sha256 -and $published.builtAtUtc -eq $prepared.builtAtUtc) 'Der getestete Build wurde ersetzt.'
    Assert ($null -ne $published.publishedAtUtc) 'Erfolgreicher Upload ist nicht dokumentiert.'
    $publishedProof = Get-Content -LiteralPath (Join-Path $fixture 'dist/release.json') -Raw
    & $script @parameters -SkipBuild | Out-Null
    Assert ((Get-Content -LiteralPath (Join-Path $fixture 'dist/release.json') -Raw) -eq $publishedProof) 'Eine reine Prüfung darf die Metadaten des letzten Releases nicht überschreiben.'

    $uploads = $global:ReleaseTestUploads
    $source = Join-Path $fixture 'layout/playbook_training.xml'
    $original = [IO.File]::ReadAllBytes($source)
    'changed-layout' | Set-Content -LiteralPath $source
    Expect-Failure { & $script @parameters -Publish -SkipBuild } 'Quellen.*geändert'
    [IO.File]::WriteAllBytes($source, $original)
    $global:ReleaseTestCommit = 'new-commit'
    Expect-Failure { & $script @parameters -Publish -SkipBuild } 'Commit.*geändert'
    $global:ReleaseTestCommit = 'test-commit'
    $asset = Join-Path $fixture 'dist/panorama/styles/custom_game/playbook_training.vcss_c'
    $original = [IO.File]::ReadAllBytes($asset)
    'changed-styles' | Set-Content -LiteralPath $asset
    Expect-Failure { & $script @parameters -Publish -SkipBuild } 'HUD-Dateien.*geändert'
    [IO.File]::WriteAllBytes($asset, $original)
    $package = Join-Path $fixture 'dist/workshop/3810441722.vpk'
    [IO.File]::WriteAllText($package, 'changed-vpk')
    Expect-Failure { & $script @parameters -Publish -SkipBuild } 'VPK.*geändert'
    [IO.File]::WriteAllText($package, 'mock-vpk')
    $extra = Join-Path $fixture 'dist/workshop/unintended.txt'
    'not-for-upload' | Set-Content -LiteralPath $extra
    Expect-Failure { & $script @parameters -Publish -SkipBuild } 'Upload-Verzeichnis'
    Remove-Item -LiteralPath $extra
    Assert ($global:ReleaseTestUploads -eq $uploads) 'Ein veränderter Stand darf nicht hochgeladen werden.'

    Expect-Failure { & $script @parameters -Publish -ChangeNote "bad`nvalue" } 'Steuerzeichen'
    Assert ($global:ReleaseTestUploads -eq $uploads) 'Ungültige Metadaten dürfen nicht hochgeladen werden.'
    $global:ReleaseTestPackExit = 1
    Expect-Failure { & $script @parameters -Publish } 'VPK konnte nicht'
    Assert ($global:ReleaseTestUploads -eq $uploads) 'Fehlgeschlagene Builds dürfen nicht hochgeladen werden.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $fixture 'dist/release.json'))) 'Ein fehlgeschlagener Build darf keinen alten Release-Nachweis behalten.'
    $global:ReleaseTestPackExit = 0

    $global:ReleaseTestSteamOutput = 'ERROR! Upload failed'
    Expect-Failure { & $script @parameters -Publish } 'Upload nicht bestätigt'
    $global:ReleaseTestSteamOutput = 'Success. Uploaded item to Workshop (PublishedFileID 999).'
    Expect-Failure { & $script @parameters -Publish } 'Upload nicht bestätigt'
    $global:ReleaseTestSteamOutput = 'Success. Uploaded item to Workshop (PublishedFileID 3810441722).'
    $global:ReleaseTestSteamExit = 1
    Expect-Failure { & $script @parameters -Publish } 'Upload nicht bestätigt'
    Write-Output 'Release-Vertrag geprüft: Build-only, getestetes Paket, Änderungsprüfung, Ziel-ID, Metadaten, Upload und Fehlerbehandlung.'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Remove-Item Function:\dotnet, Function:\git -ErrorAction SilentlyContinue
    Get-Variable -Name ReleaseTest* -Scope Global | Remove-Variable -Scope Global
}
