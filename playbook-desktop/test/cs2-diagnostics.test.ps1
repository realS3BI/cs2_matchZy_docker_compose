$ErrorActionPreference = 'Stop'
$script:Games = @()
$script:Listeners = @()
$script:ListenerDenied = $false
function Get-CimInstance {
    param($ClassName, $Filter)
    if ($ClassName -ne 'Win32_Process' -or $Filter -ne "Name = 'cs2.exe'") { throw 'Wrong process query' }
    $script:Games
}
function Get-Process {
    param($Id, $ErrorAction)
    [pscustomobject]@{ MainWindowHandle = [IntPtr]1; StartTime = (Get-Date).AddSeconds(-120) }
}
function Get-NetTCPConnection {
    param($State, $ErrorAction)
    if ($State -ne 'Listen') { throw 'Wrong TCP query' }
    if ($script:ListenerDenied) { throw 'Access denied; secret diagnostic stderr' }
    $script:Listeners
}
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../src/cs2-diagnostics.ps1') -Raw -Encoding UTF8
$read = [scriptblock]::Create($source)
function Check($command, $readable, $enabled, $port) {
    $script:Games = @([pscustomobject]@{ CommandLine = $command; ProcessId = 42 })
    $json = & $read
    $result = $json | ConvertFrom-Json
    if (-not $result.running -or $result.readable -ne $readable -or $result.vconsole -ne $enabled -or $result.port -ne $port) {
        throw "Incorrect diagnostic: $json"
    }
    if ($json -match 'secret|CommandLine|Private') { throw 'Full command line leaked' }
}
Check '"C:\Private\cs2.exe" +password secret' $true $false $null
Check '"C:\Private\cs2.exe" -console -vconsole -vconport 29000 +password secret' $true $true $null
Check '"C:\Private\cs2.exe" -console -netconport 2121 +password secret' $true $false 2121
Check '"C:\Private\cs2.exe" "-netconport" "2122" +password secret' $true $false 2122
Check '"C:\Private\cs2.exe" -vconsole-other -netconport-other 2122' $true $false $null
Check $null $false $false $null
$script:Games = @()
if ((& $read | ConvertFrom-Json).running) { throw 'Reported a nonexistent game' }
$script:Games = @([pscustomobject]@{ CommandLine = '-vconsole'; ProcessId = 42 }, [pscustomobject]@{ CommandLine = '-vconsole'; ProcessId = 43 })
if ((& $read | ConvertFrom-Json).readable) { throw 'Guessed between multiple games' }
$script:Listeners = @(
    [pscustomobject]@{ LocalAddress = '0.0.0.0'; LocalPort = 29000; OwningProcess = 42 },
    [pscustomobject]@{ LocalAddress = '127.0.0.1'; LocalPort = 2121; OwningProcess = 99 },
    [pscustomobject]@{ LocalAddress = '0.0.0.0'; LocalPort = 9999; OwningProcess = 99 }
)
$pipeId = 'a' * 32
Check ('"C:\Private\cs2.exe" -insecure -concommandpipe \\.\pipe\playbook_' + $pipeId + '_cmd,\\.\pipe\playbook_' + $pipeId + '_out +password secret') $true $false $null
$result = & $read | ConvertFrom-Json
if (-not $result.commandPipe -or -not $result.insecure -or $result.playbookPipeId -ne $pipeId) { throw 'Playbook pipe was not identified' }
if ($result.processId -ne 42 -or -not $result.hasWindow -or $result.uptimeSeconds -lt 119) { throw 'Window or process age missing' }
if (-not $result.listenersReadable -or $result.listeners.Count -ne 2 -or -not ($result.listeners | Where-Object { $_.port -eq 29000 }).cs2) { throw 'Incorrect listener ownership or unrelated listener leaked' }
$script:ListenerDenied = $true
$json = & $read
$result = $json | ConvertFrom-Json
if ($result.listenersReadable -or -not $result.running -or $json -match 'secret|stderr') { throw 'Denied TCP inspection hid process information or leaked its error' }
$script:ListenerDenied = $false
Check 'cs2.exe -netconport 2121 -netconport 2222 -netconpassword secret' $true $false 2121
$result = & $read | ConvertFrom-Json
if ($result.ports.Count -ne 2 -or -not $result.netconPassword) { throw 'Duplicate ports or password flag missing' }
Write-Output 'CS2 diagnosis: launch flags, command pipes, process/window, listener ownership and denied inspections passed; no command line or password returned.'
