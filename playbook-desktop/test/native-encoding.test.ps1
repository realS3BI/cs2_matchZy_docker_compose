$ErrorActionPreference = 'Stop'
$helper = (Resolve-Path (Join-Path $PSScriptRoot '../native/bin/publish/Playbook.Windows.exe')).Path
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $env:ComSpec
$start.Arguments = '/d /c chcp 1252 >nul & "' + $helper + '" invalid'
$start.UseShellExecute = $false
$start.RedirectStandardError = $true
$start.RedirectStandardOutput = $true
$start.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false, $true)
$start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$previousEncoding = [Console]::OutputEncoding
$process = [System.Diagnostics.Process]::Start($start)
try {
    if (-not $process.WaitForExit(10000)) { $process.Kill(); throw 'Native encoding test timed out' }
    $errorText = $process.StandardError.ReadToEnd().Trim()
    $expected = 'Ung' + [char]0x00fc + 'ltige Playbook-Aktion.'
    if ($process.ExitCode -ne 1 -or $errorText -cne $expected) { throw 'Native error was not valid UTF-8 under code page 1252' }
    Write-Output 'Native stderr stays UTF-8 under Windows code page 1252.'
} finally { $process.Dispose(); [Console]::OutputEncoding = $previousEncoding }
