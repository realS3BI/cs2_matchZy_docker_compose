#Requires -Version 7.0
param(
    [Parameter(Position = 0)][ValidateSet('update', 'release', 'live', 'status')][string]$Mode = 'update',
    [string]$Cs2,
    [string]$SteamCmd,
    [string]$SteamUsername
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot

if ($Mode -eq 'update') {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git fehlt. Git for Windows installieren, danach das Skript erneut starten.'
    }
    Write-Output 'Git-Arbeitskopie für Panorama-Panel und Playbook aktualisieren ...'
    & git -C $repository pull --ff-only
    if ($LASTEXITCODE -ne 0) {
        throw 'Git-Update fehlgeschlagen. Git-Verbindung, lokale Änderungen und Branch prüfen. Panorama-Panel und Playbook wurden nicht neu gebaut.'
    }
}

# Invoke the file from disk after pulling so this run uses the downloaded workflow.
$parameters = @{ Mode = $Mode }
foreach ($name in @('Cs2', 'SteamCmd', 'SteamUsername')) {
    if ($PSBoundParameters.ContainsKey($name)) { $parameters[$name] = $PSBoundParameters[$name] }
}
& (Join-Path $PSScriptRoot 'local-release.ps1') @parameters
