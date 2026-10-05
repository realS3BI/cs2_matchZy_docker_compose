#Requires -Version 5.1
param(
    [string]$Cs2,
    [ValidateSet('local', 'live', 'status')][string]$Mode = 'local'
)
$ErrorActionPreference = 'Stop'
if (-not $Cs2) {
    $steam = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
    if (-not $steam -and ${env:ProgramFiles(x86)}) { $steam = Join-Path ${env:ProgramFiles(x86)} 'Steam' }
    $libraries = @()
    if ($steam) {
        $libraries += $steam
        $libraryFile = Join-Path $steam 'steamapps/libraryfolders.vdf'
        if (Test-Path -LiteralPath $libraryFile) {
            foreach ($match in [regex]::Matches((Get-Content -LiteralPath $libraryFile -Raw), '"path"\s*"([^"]+)"')) {
                $libraries += $match.Groups[1].Value.Replace('\\', '\')
            }
        }
    }
    foreach ($library in $libraries) {
        $candidate = Join-Path $library 'steamapps/common/Counter-Strike Global Offensive'
        if (Test-Path -LiteralPath (Join-Path $candidate 'game/csgo') -PathType Container) {
            $Cs2 = $candidate
            break
        }
    }
    if (-not $Cs2) { $Cs2 = (Read-Host 'CS2-Installationsordner mit game/csgo angeben').Trim().Trim('"') }
}
& (Join-Path $PSScriptRoot 'panel-source.ps1') -Mode $Mode -Cs2 $Cs2 -SkipBuild -Assets (Join-Path $PSScriptRoot 'game/csgo')
if ($Mode -eq 'local') {
    Write-Output 'Installation abgeschlossen. CS2 neu starten, mit dem Trainingsserver verbinden und .nades eingeben.'
}
