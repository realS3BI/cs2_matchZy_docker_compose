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

function Close-PlaybookForUpdate {
    $currentSessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $installers = @(Get-Process -Name 'Playbook-Setup-*' -ErrorAction SilentlyContinue |
        Where-Object { $_.SessionId -eq $currentSessionId })
    if ($installers.Count -gt 0) {
        throw 'Ein Playbook-Installer ist bereits geöffnet. Bitte die laufende Installation abschließen oder dort Abbrechen wählen und playbook.cmd erneut starten.'
    }

    $processes = @(Get-Process -Name 'Playbook', 'Playbook.Windows' -ErrorAction SilentlyContinue)
    if ($processes.Count -eq 0) { return }

    Write-Host 'Playbook wird regulär geschlossen. Spieleinstellungen können dabei wiederhergestellt werden ...'
    foreach ($playbookProcess in $processes) {
        if ($playbookProcess.SessionId -eq $currentSessionId -and $playbookProcess.MainWindowHandle -ne [IntPtr]::Zero) {
            try { [void]$playbookProcess.CloseMainWindow() }
            catch { Write-Host "Das Playbook-Fenster von Prozess $($playbookProcess.Id) konnte nicht geschlossen werden. Bitte selbst schließen." }
        }
    }

    # Electron's child processes and local CS2 recovery can outlive the window.
    # Wait for all files to be released before either rebuilding or installing.
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $remaining = @(Get-Process -Name 'Playbook', 'Playbook.Windows' -ErrorAction SilentlyContinue)
        if ($remaining.Count -eq 0) { return }
        Start-Sleep -Milliseconds 500
    }
    $details = ($remaining | ForEach-Object { "$($_.ProcessName), PID $($_.Id), Sitzung $($_.SessionId)" }) -join '; '
    throw "Playbook läuft weiterhin: $details. Bitte Playbook und mögliche Rückfragen schließen. Falls kein Fenster mehr sichtbar ist, nach dem Beenden deines Reviews die genannten Prozesse im Task-Manager beenden. Danach playbook.cmd erneut starten."
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

    Close-PlaybookForUpdate
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

        # The user may have reopened Playbook during the build.
        Close-PlaybookForUpdate
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
