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
    @'
param([string]$Cs2)
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'dist') | Out-Null
'@ | Set-Content -LiteralPath (Join-Path $fixture 'build.ps1')
    @'
$global:ReleaseTestUploads++
$global:ReleaseTestArguments = $args
$global:LASTEXITCODE = $global:ReleaseTestSteamExit
Write-Output $global:ReleaseTestSteamOutput
'@ | Set-Content -LiteralPath (Join-Path $fixture 'steamcmd.ps1')
    function global:dotnet {
        [IO.File]::WriteAllText($args[-1], 'mock-vpk')
        $global:LASTEXITCODE = $global:ReleaseTestPackExit
    }
    function global:git { $global:LASTEXITCODE = 0; 'test-commit' }
    $global:ReleaseTestUploads = 0
    $global:ReleaseTestPackExit = 0
    $global:ReleaseTestSteamExit = 0
    $global:ReleaseTestSteamOutput = 'Success. Uploaded item to Workshop (PublishedFileID 3810441722).'
    $script = Join-Path $fixture 'release.ps1'
    $parameters = @{ Cs2 = $fixture; SteamCmd = (Join-Path $fixture 'steamcmd.ps1'); SteamUsername = 'test_owner' }
    $vdfPath = Join-Path $fixture 'dist/workshop-upload.vdf'

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
    Assert ($global:ReleaseTestArguments -contains '+@NoPromptForPassword') 'CI darf keine interaktive Passwortabfrage starten.'

    Expect-Failure { & $script @parameters -Publish -ChangeNote "bad`nvalue" } 'Steuerzeichen'
    Assert ($global:ReleaseTestUploads -eq 1) 'Ungültige Metadaten dürfen nicht hochgeladen werden.'
    $global:ReleaseTestPackExit = 1
    Expect-Failure { & $script @parameters -Publish } 'VPK konnte nicht'
    Assert ($global:ReleaseTestUploads -eq 1) 'Fehlgeschlagene Builds dürfen nicht hochgeladen werden.'
    $global:ReleaseTestPackExit = 0

    $global:ReleaseTestSteamOutput = 'ERROR! Upload failed'
    Expect-Failure { & $script @parameters -Publish } 'Upload nicht bestätigt'
    $global:ReleaseTestSteamOutput = 'Success. Uploaded item to Workshop (PublishedFileID 999).'
    Expect-Failure { & $script @parameters -Publish } 'Upload nicht bestätigt'
    $global:ReleaseTestSteamOutput = 'Success. Uploaded item to Workshop (PublishedFileID 3810441722).'
    $global:ReleaseTestSteamExit = 1
    Expect-Failure { & $script @parameters -Publish } 'Upload nicht bestätigt'
    Write-Output 'Release-Vertrag geprüft: Build-only, Ziel-ID, Metadaten, Upload und Fehlerbehandlung.'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Remove-Item Function:\dotnet, Function:\git -ErrorAction SilentlyContinue
    Get-Variable -Name ReleaseTest* -Scope Global | Remove-Variable -Scope Global
}
