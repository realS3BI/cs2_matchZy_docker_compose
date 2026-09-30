#Requires -Version 7.0
param(
    [Parameter(Mandatory = $true)][string]$Cs2,
    [switch]$Publish,
    [string]$SteamCmd = $env:STEAMCMD_PATH,
    [string]$SteamUsername = $env:STEAM_USERNAME,
    [ValidateSet('keep', 'public', 'friends', 'private', 'unlisted')][string]$Visibility = 'keep',
    [string]$ChangeNote = 'Trainingspanel aktualisiert'
)
$ErrorActionPreference = 'Stop'
$workshopId = '3810441722'
$dist = Join-Path $PSScriptRoot 'dist'
$content = Join-Path $dist 'workshop'

if ($Publish) {
    if (-not $SteamCmd -or -not (Test-Path -LiteralPath $SteamCmd -PathType Leaf)) {
        throw 'STEAMCMD_PATH muss auf die installierte steamcmd.exe zeigen.'
    }
    if ($SteamUsername -notmatch '^[A-Za-z0-9_]+$') { throw 'STEAM_USERNAME muss der Steam-Anmeldename des Workshop-Erstellers sein.' }
    $SteamCmd = (Resolve-Path -LiteralPath $SteamCmd).Path
}

& (Join-Path $PSScriptRoot 'build.ps1') -Cs2 $Cs2
if (Test-Path -LiteralPath $content) { Remove-Item -LiteralPath $content -Recurse -Force }
New-Item -ItemType Directory -Path $content | Out-Null
$vpk = Join-Path $content "$workshopId.vpk"
& dotnet run --project (Join-Path $PSScriptRoot 'WorkshopPack/WorkshopPack.csproj') --configuration Release -- $dist $vpk
if ($LASTEXITCODE -ne 0) { throw 'Workshop-VPK konnte nicht erstellt werden.' }

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
$revision = & git -C $PSScriptRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Git-Revision konnte nicht gelesen werden.' }
[ordered]@{
    workshopId = $workshopId
    commit = $revision
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    sha256 = (Get-FileHash -LiteralPath $vpk -Algorithm SHA256).Hash
    visibility = $Visibility
    changeNote = $ChangeNote
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dist 'release.json') -Encoding utf8NoBOM

if (-not $Publish) {
    Write-Output "Release gebaut, nichts hochgeladen. VDF für diesen Rechner: $vdf"
    return
}

# Steam Guard must have been completed interactively on this runner under the same Windows account.
# Reuse SteamCMD's saved login; do not store Steam passwords or guard codes in the repository/artifact.
Push-Location (Split-Path -Parent $SteamCmd)
try {
    $output = & $SteamCmd +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 +login $SteamUsername +workshop_build_item $vdf +quit 2>&1
    $exitCode = $LASTEXITCODE
    $output | ForEach-Object { Write-Output "$_" }
    if ($exitCode -ne 0 -or ($output -join "`n") -notmatch "(?im)Success\..*(?:PublishedFileID\D*)?$workshopId\b") {
        throw 'SteamCMD hat den Upload nicht bestätigt. Login/Steam Guard lokal erneuern; Ausgabe und SteamCMD-Logs prüfen. Alternativ den Workshop Manager verwenden.'
    }
} finally { Pop-Location }
Write-Output "Workshop-Item aktualisiert: https://steamcommunity.com/sharedfiles/filedetails/?id=$workshopId"
