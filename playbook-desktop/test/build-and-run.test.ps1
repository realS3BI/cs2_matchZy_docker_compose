#Requires -Version 5.1
param([string]$Case)
$ErrorActionPreference = 'Stop'

if (-not $Case) {
    $hostExecutable = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $hostPrefix = @()
    if ([IO.Path]::GetFileNameWithoutExtension($hostExecutable) -eq 'dotnet') { $hostPrefix = @([Environment]::GetCommandLineArgs()[0]) }
    foreach ($scenario in @('running', 'reopened', 'stuck', 'installer-open', 'build-failure', 'clean', 'direct', 'direct-reopened', 'direct-build-failure', 'direct-missing-app')) {
        & $hostExecutable @hostPrefix -NoLogo -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Case $scenario
        if ($LASTEXITCODE -ne 0) { throw "Update-Test fehlgeschlagen: $scenario" }
    }
    Write-Host 'PASS: Alle zehn Update-Abläufe geprüft.'
    exit 0
}

# Exercise the real build entry point with simulated Windows processes and build
# commands. No installer, process termination, npm install, or build is executed.
$global:UpdateTestCase = $Case
$global:UpdateTestClosed = $Case -notin @('running', 'stuck')
$global:UpdateTestCloseRequested = $false
$global:UpdateTestPolls = 0
$global:UpdateTestInstallerStarted = $false
$global:UpdateTestBuildStarted = $false
$global:UpdateTestBuildCommands = @()
$global:LASTEXITCODE = 0
$testVersion = (Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$testApp = [pscustomobject]@{
    Id = 4242; ProcessName = 'Playbook'; MainWindowHandle = [IntPtr]1
    SessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
}
$testApp | Add-Member ScriptMethod CloseMainWindow {
    $global:UpdateTestCloseRequested = $true
    return $true
}
$testInstaller = [pscustomobject]@{
    Id = 4243; ProcessName = 'Playbook-Setup-0.1.0'; MainWindowHandle = [IntPtr]1
    SessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
}
function node.exe { $global:LASTEXITCODE = 0; '22.20.0' }
function dotnet.exe { $global:LASTEXITCODE = 0; '10.0.100 [test]' }
function npm.cmd {
    $global:UpdateTestBuildStarted = $true
    $global:UpdateTestBuildCommands += $args -join ' '
    $global:LASTEXITCODE = 0
    if ($global:UpdateTestCase -in @('build-failure', 'direct-build-failure') -and ('dist' -in $args -or 'build:app' -in $args)) { $global:LASTEXITCODE = 1 }
    if ($global:UpdateTestCase -in @('reopened', 'direct-reopened') -and ('dist' -in $args -or 'build:app' -in $args)) { $global:UpdateTestClosed = $false }
}
function Get-Process {
    param($Name, $ErrorAction)
    if ('Playbook-Setup-*' -in $Name) {
        if ($global:UpdateTestCase -eq 'installer-open') { $testInstaller }
        return
    }
    if ($global:UpdateTestCloseRequested) {
        $global:UpdateTestPolls++
        if ($global:UpdateTestCase -in @('running', 'reopened', 'direct-reopened') -and $global:UpdateTestPolls -ge 3) { $global:UpdateTestClosed = $true }
    }
    if (-not $global:UpdateTestClosed) {
        if ($global:UpdateTestCloseRequested) {
            # The window closed, but an Electron child still holds app files.
            [pscustomobject]@{ Id = 4244; ProcessName = 'Playbook'; MainWindowHandle = [IntPtr]::Zero; SessionId = $testApp.SessionId }
        } else { $testApp }
    }
}
function Start-Sleep { param($Milliseconds, $Seconds) }
function Test-Path {
    param($LiteralPath, $PathType)
    return -not ($global:UpdateTestCase -eq 'direct-missing-app' -and $LiteralPath.EndsWith('Playbook.exe'))
}
function Start-Process {
    param($FilePath, $WorkingDirectory)
    $global:UpdateTestInstallerStarted = $true
    if (-not $global:UpdateTestClosed) { throw 'Playbook kann nicht geschlossen werden: Der Installer startete mit laufender App.' }
    if ($global:UpdateTestCase.StartsWith('direct')) {
        if (-not $FilePath.EndsWith('dist\win-unpacked\Playbook.exe')) { throw 'Es muss die frisch gebaute App starten.' }
        if ($WorkingDirectory -ne (Split-Path -Parent $FilePath)) { throw 'Falsches Arbeitsverzeichnis für die App.' }
        if ($env:ELECTRON_RUN_AS_NODE) { throw 'Electron darf beim App-Start nicht im Node-Modus laufen.' }
    } elseif (-not $FilePath.EndsWith("Playbook-Setup-$testVersion.exe")) { throw 'Falscher Installer.' }
}

$direct = $Case.StartsWith('direct')
if ($direct) { $env:ELECTRON_RUN_AS_NODE = '1' }
& (Join-Path (Split-Path $PSScriptRoot -Parent) 'build-and-run.ps1') -LaunchDirect:$direct
$buildExitCode = $LASTEXITCODE
if ($Case -in @('running', 'reopened', 'clean', 'direct', 'direct-reopened')) {
    if ($buildExitCode -ne 0 -or -not $global:UpdateTestInstallerStarted -or -not $global:UpdateTestClosed) {
        throw 'Installer muss nach dem vollständigen Beenden von Playbook starten.'
    }
    if ($direct) {
        if ('run build:app' -notin $global:UpdateTestBuildCommands -or 'run dist' -in $global:UpdateTestBuildCommands) { throw 'Der Direktstart muss die App ohne Installer bauen.' }
        if ($env:ELECTRON_RUN_AS_NODE -ne '1') { throw 'Die Umgebung des aufrufenden Skripts muss erhalten bleiben.' }
    }
} else {
    if ($buildExitCode -eq 0 -or $global:UpdateTestInstallerStarted) { throw 'Trotz Blockade wurde ein Installer gestartet.' }
    if ($Case -in @('stuck', 'installer-open') -and $global:UpdateTestBuildStarted) { throw 'Trotz blockierter Dateien wurde gebaut.' }
}
Write-Host "PASS: $Case"
exit 0
