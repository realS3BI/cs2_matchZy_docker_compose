$ErrorActionPreference = 'Stop'
$script:Games = @()
function Get-CimInstance {
    param($ClassName, $Filter)
    if ($ClassName -ne 'Win32_Process' -or $Filter -ne "Name = 'cs2.exe'") { throw 'Wrong process query' }
    $script:Games
}
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../src/cs2-diagnostics.ps1') -Raw -Encoding UTF8
$read = [scriptblock]::Create($source)
function Check($command, $readable, $enabled, $port) {
    $script:Games = @([pscustomobject]@{ CommandLine = $command })
    $json = & $read
    $result = $json | ConvertFrom-Json
    if (-not $result.running -or $result.readable -ne $readable -or $result.vconsole -ne $enabled -or $result.port -ne $port) {
        throw "Incorrect diagnostic: $json"
    }
    if ($json -match 'secret|password|Private') { throw 'Full command line leaked' }
}
Check '"C:\Private\cs2.exe" +password secret' $true $false $null
Check '"C:\Private\cs2.exe" -console -vconsole -vconport 29000 +password secret' $true $true 29000
Check '"C:\Private\cs2.exe" "-vconsole" "-vconport" "29001" +password secret' $true $true 29001
Check '"C:\Private\cs2.exe" -vconsole-other -vconport-other 29001' $true $false $null
Check $null $false $false $null
$script:Games = @()
if ((& $read | ConvertFrom-Json).running) { throw 'Reported a nonexistent game' }
$script:Games = @([pscustomobject]@{ CommandLine = '-vconsole' }, [pscustomobject]@{ CommandLine = '-vconsole' })
if ((& $read | ConvertFrom-Json).readable) { throw 'Guessed between multiple games' }
Write-Output 'CS2 launch diagnosis: 7 cases passed; no full command line returned.'
