$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$games = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'cs2.exe'")
$result = @{ running = ($games.Count -gt 0); readable = $false; vconsole = $false; port = $null }
if ($games.Count -eq 1 -and -not [string]::IsNullOrWhiteSpace($games[0].CommandLine)) {
  $result.readable = $true
  $command = $games[0].CommandLine
  $result.vconsole = [regex]::IsMatch($command, '(?i)(?:^|\s)"?-vconsole"?(?=\s|$)')
  $port = [regex]::Match($command, '(?i)(?:^|\s)"?-vconport"?\s+"?(\d+)"?(?=\s|$)')
  if ($port.Success) { $result.port = [int]$port.Groups[1].Value }
}
ConvertTo-Json -InputObject $result -Compress
