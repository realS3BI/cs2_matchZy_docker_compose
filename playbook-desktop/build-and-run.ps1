#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

function Invoke-BuildCommand {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "'$Executable $($Arguments -join ' ')' ist fehlgeschlagen (Exitcode $LASTEXITCODE)."
    }
}

try {
    foreach ($requirement in @(
        @{ Command = 'node.exe'; Name = 'Node.js 22 oder neuer' },
        @{ Command = 'npm.cmd'; Name = 'npm, enthalten in Node.js' },
        @{ Command = 'dotnet.exe'; Name = '.NET SDK 10' }
    )) {
        if (-not (Get-Command $requirement.Command -ErrorAction SilentlyContinue)) {
            throw "$($requirement.Name) fehlt. Bitte installieren und playbook.cmd erneut öffnen."
        }
    }

    $nodeVersion = & node.exe -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -split '\.')[0] -lt 22) {
        throw 'Für den Build wird Node.js 22 oder neuer benötigt.'
    }
    $sdkVersions = & dotnet.exe --list-sdks
    if ($LASTEXITCODE -ne 0 -or ($sdkVersions -join "`n") -notmatch '(?m)^10\.') {
        throw '.NET SDK 10 fehlt. Die .NET Runtime allein genügt nicht. Bitte das SDK installieren.'
    }

    Push-Location $PSScriptRoot
    try {
        Write-Host '[2/4] Build-Abhängigkeiten installieren ...'
        Invoke-BuildCommand -Executable 'npm.cmd' -Arguments @('ci', '--include=dev')

        Write-Host '[3/4] Playbook testen und Windows-Installer bauen ...'
        Invoke-BuildCommand -Executable 'npm.cmd' -Arguments @('run', 'dist')

        $package = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $installer = Join-Path $PSScriptRoot "dist\Playbook-Setup-$($package.version).exe"
        if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
            throw "Der gebaute Installer wurde nicht gefunden: $installer"
        }

        Write-Host '[4/4] Installer starten ...'
        Start-Process -FilePath $installer
        Write-Host 'Der Installer ist geöffnet. Playbook startet nach der Installation automatisch.'
    }
    finally { Pop-Location }
}
catch {
    Write-Host "Playbook konnte nicht gebaut oder gestartet werden: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
