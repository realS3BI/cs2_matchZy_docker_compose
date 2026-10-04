#Requires -Version 7.0
param(
    [Parameter(Mandatory = $true)][string]$Cs2,
    [switch]$Publish,
    [switch]$SkipBuild,
    [string]$SteamCmd = $env:STEAMCMD_PATH,
    [string]$SteamUsername = $env:STEAM_USERNAME,
    [ValidateSet('keep', 'public', 'friends', 'private', 'unlisted')][string]$Visibility = 'keep',
    [string]$ChangeNote = 'Trainingspanel aktualisiert'
)
$ErrorActionPreference = 'Stop'
$workshopId = '3810441722'
$dist = Join-Path $PSScriptRoot 'dist'
$content = Join-Path $dist 'workshop'
$vpk = Join-Path $content "$workshopId.vpk"
$manifestPath = Join-Path $dist 'release.json'
$sourcePaths = @('layout/playbook_training.xml', 'styles/playbook_training.css')
$assetPaths = @('panorama/layout/custom_game/playbook_training.vxml_c', 'panorama/styles/custom_game/playbook_training.vcss_c')

function Get-HudHashes([string]$Root, [string[]]$Paths) {
    $hashes = [ordered]@{}
    foreach ($relative in $Paths) {
        $path = Join-Path $Root $relative
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "HUD-Datei fehlt: $path. Neu bauen und im Spiel testen." }
        $hashes[$relative] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    }
    return $hashes
}

function Assert-HudHashes($Expected, $Actual, [string]$Message) {
    if (-not $Expected -or $Expected.Count -ne $Actual.Count) { throw $Message }
    foreach ($key in $Actual.Keys) {
        if ($Expected[$key] -ne $Actual[$key]) { throw $Message }
    }
}

function Get-HudRevision {
    $revision = & git -C $PSScriptRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Git-Revision konnte nicht gelesen werden.' }
    return $revision
}

if ($Publish) {
    if (-not $SteamCmd -or -not (Test-Path -LiteralPath $SteamCmd -PathType Leaf)) {
        throw 'STEAMCMD_PATH muss auf die installierte steamcmd.exe zeigen.'
    }
    if ($SteamUsername -notmatch '^[A-Za-z0-9_]+$') { throw 'STEAM_USERNAME muss der Steam-Anmeldename des Workshop-Erstellers sein.' }
    $SteamCmd = (Resolve-Path -LiteralPath $SteamCmd).Path
}

if ($SkipBuild) {
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Release-Nachweis fehlt. Zuerst hud.cmd starten und das lokale HUD aktualisieren.' }
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable } catch {
        throw 'Release-Nachweis ist ungültig. Neu bauen und im Spiel testen.'
    }
    if ($manifest.schemaVersion -ne 1 -or $manifest.workshopId -ne $workshopId) { throw 'Release-Nachweis ist ungültig. Neu bauen und im Spiel testen.' }
    if ($manifest.commit -ne (Get-HudRevision)) { throw 'Commit seit dem Build geändert. Neu bauen und im Spiel testen.' }
    Assert-HudHashes $manifest.sourceHashes (Get-HudHashes $PSScriptRoot $sourcePaths) 'HUD-Quellen seit dem Build geändert. Neu bauen und im Spiel testen.'
    Assert-HudHashes $manifest.assetHashes (Get-HudHashes $dist $assetPaths) 'Kompilierte HUD-Dateien seit dem Build geändert. Neu bauen und im Spiel testen.'
    if (-not (Test-Path -LiteralPath $vpk -PathType Leaf) -or (Get-FileHash -LiteralPath $vpk -Algorithm SHA256).Hash -ne $manifest.sha256) {
        throw 'Workshop-VPK fehlt oder wurde seit dem Build geändert. Neu bauen und im Spiel testen.'
    }
    $uploadFiles = @(Get-ChildItem -LiteralPath $content -Force)
    if ($uploadFiles.Count -ne 1 -or $uploadFiles[0].Name -ne "$workshopId.vpk") { throw 'Upload-Verzeichnis enthält weitere Dateien. Neu bauen und im Spiel testen.' }
    if (-not $Publish) {
        Write-Output "Vorbereiteter Release geprüft: $vpk"
        return
    }
} else {
    # A failed rebuild must not leave a reusable release proof from an earlier build.
    if (Test-Path -LiteralPath $manifestPath) { Remove-Item -LiteralPath $manifestPath }
    $sourceHashes = Get-HudHashes $PSScriptRoot $sourcePaths
    $revision = Get-HudRevision
    & (Join-Path $PSScriptRoot 'build.ps1') -Cs2 $Cs2
    if (Test-Path -LiteralPath $content) { Remove-Item -LiteralPath $content -Recurse -Force }
    New-Item -ItemType Directory -Path $content | Out-Null
    & dotnet run --project (Join-Path $PSScriptRoot 'WorkshopPack/WorkshopPack.csproj') --configuration Release -- $dist $vpk
    if ($LASTEXITCODE -ne 0) { throw 'Workshop-VPK konnte nicht erstellt werden.' }
    Assert-HudHashes $sourceHashes (Get-HudHashes $PSScriptRoot $sourcePaths) 'HUD-Quellen während des Builds geändert. Neu bauen und im Spiel testen.'
    $manifest = [ordered]@{
        schemaVersion = 1
        workshopId = $workshopId
        commit = $revision
        builtAtUtc = [DateTime]::UtcNow.ToString('o')
        sha256 = (Get-FileHash -LiteralPath $vpk -Algorithm SHA256).Hash
        sourceHashes = $sourceHashes
        assetHashes = Get-HudHashes $dist $assetPaths
    }
}

# KeyValues values cannot contain unescaped quotes, backslashes or line breaks.
function ConvertTo-VdfValue([string]$Value) {
    if ($Value -match '[\x00-\x1f\x7f]') { throw 'Workshop-Metadaten dürfen keine Steuerzeichen oder Zeilenumbrüche enthalten.' }
    return $Value.Replace('\', '\\').Replace('"', '\"')
}
$fields = [ordered]@{
    appid = '730'
    publishedfileid = $workshopId
    contentfolder = $content
    changenote = $ChangeNote
}
# Omitted metadata is preserved by Steam. Do not rename the item or reset visibility on every release.
if ($Visibility -ne 'keep') { $fields.visibility = @{ public = '0'; friends = '1'; private = '2'; unlisted = '3' }[$Visibility] }
$vdf = Join-Path $dist 'workshop-upload.vdf'
$lines = @('"workshopitem"', '{')
foreach ($field in $fields.GetEnumerator()) { $lines += '    "' + $field.Key + '" "' + (ConvertTo-VdfValue $field.Value) + '"' }
$lines += '}'
Set-Content -LiteralPath $vdf -Value $lines -Encoding utf8NoBOM
$manifest.visibility = $Visibility
$manifest.changeNote = $ChangeNote
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM

if (-not $Publish) {
    Write-Output "Release bereit, nichts hochgeladen. VDF für diesen Rechner: $vdf"
    return
}

# The local wizard completes Steam Guard interactively before this non-interactive upload.
Push-Location (Split-Path -Parent $SteamCmd)
try {
    $output = [Collections.Generic.List[string]]::new()
    & $SteamCmd +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 +login $SteamUsername +workshop_build_item $vdf +quit 2>&1 | ForEach-Object {
        $output.Add("$_")
        Write-Host "$_"
    }
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -or ($output -join "`n") -notmatch "(?im)Success\..*(?:PublishedFileID\D*)?$workshopId\b") {
        throw 'SteamCMD hat den Upload nicht bestätigt. Login/Steam Guard lokal erneuern; Ausgabe und SteamCMD-Logs prüfen. Alternativ den Workshop Manager verwenden.'
    }
} finally { Pop-Location }
$manifest.publishedAtUtc = [DateTime]::UtcNow.ToString('o')
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
Write-Output "Workshop-Item aktualisiert: https://steamcommunity.com/sharedfiles/filedetails/?id=$workshopId"
