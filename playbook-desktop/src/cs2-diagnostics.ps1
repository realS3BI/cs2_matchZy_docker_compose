param([int]$ExpectedPort = 2121)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$games = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'cs2.exe'")
$result = @{
  running = ($games.Count -gt 0); readable = $false; vconsole = $false; port = $null
  processCount = $games.Count; processId = $null; uptimeSeconds = $null; hasWindow = $null
  console = $false; tools = $false; insecure = $false; commandPipe = $false; playbookPipeId = $null; netconPassword = $false
  ports = @(); expectedPort = $ExpectedPort; listenersReadable = $false; listeners = @(); listenerError = $null
}
if ($games.Count -eq 1 -and -not [string]::IsNullOrWhiteSpace($games[0].CommandLine)) {
  $result.readable = $true
  $command = $games[0].CommandLine
  $result.vconsole = [regex]::IsMatch($command, '(?i)(?:^|\s)"?-vconsole"?(?=\s|$)')
  foreach ($flag in @('console', 'tools', 'insecure')) {
    $result[$flag] = [regex]::IsMatch($command, '(?i)(?:^|\s)"?-' + $flag + '"?(?=\s|$)')
  }
  $result.commandPipe = [regex]::IsMatch($command, '(?i)(?:^|\s)"?-concommandpipe"?(?=\s|$)')
  $playbookPipe = [regex]::Match($command, '(?i)(?:^|\s)"?-concommandpipe"?\s+"?\\\\\.\\pipe\\playbook_([a-f0-9]{32})_cmd,\\\\\.\\pipe\\playbook_\1_out"?(?=\s|$)')
  if ($playbookPipe.Success) { $result.playbookPipeId = $playbookPipe.Groups[1].Value.ToLowerInvariant() }
  $result.netconPassword = [regex]::IsMatch($command, '(?i)(?:^|\s)"?-netconpassword"?(?=\s|$)')
  $ports = [regex]::Matches($command, '(?i)(?:^|\s)"?-netconport"?\s+"?(\d+)"?(?=\s|$)')
  $result.ports = @($ports | ForEach-Object { [int]$_.Groups[1].Value })
  if ($ports.Count -gt 0) { $result.port = $result.ports[0] }
}
if ($games.Count -eq 1) {
  $result.processId = [int]$games[0].ProcessId
  try {
    $gameProcess = Get-Process -Id $result.processId -ErrorAction Stop
    $result.hasWindow = ($gameProcess.MainWindowHandle -ne [IntPtr]::Zero)
    $result.uptimeSeconds = [int][Math]::Max(0, ((Get-Date) - $gameProcess.StartTime).TotalSeconds)
  } catch { # A denied window query must not hide the process or port diagnosis.
  }
}
try {
  # The full listener table and other process names never leave this script.
  $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  $relevant = @($listeners | Where-Object {
    $_.LocalPort -eq $ExpectedPort -or $_.LocalPort -eq 29000 -or
    $_.LocalPort -in $result.ports -or ($result.running -and $_.OwningProcess -in $games.ProcessId)
  } | Select-Object -First 32)
  $result.listeners = @($relevant | ForEach-Object { @{
    address = [string]$_.LocalAddress; port = [int]$_.LocalPort; processId = [int]$_.OwningProcess
    cs2 = ($_.OwningProcess -in $games.ProcessId)
  } })
  $result.listenersReadable = $true
} catch {
  $result.listenerError = [string]$_.Exception.GetType().Name
}
ConvertTo-Json -InputObject $result -Compress
