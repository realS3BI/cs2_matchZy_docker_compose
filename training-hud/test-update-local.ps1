#Requires -Version 7.0
# Real Git repositories on disk; no GitHub, compiler, Steam account or network is used.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('hud-git-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Invoke-TestGit([string[]]$Arguments) {
    & git @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Git-Testvorbereitung fehlgeschlagen.' }
}

try {
    $remote = Join-Path $fixture 'remote.git'
    $seed = Join-Path $fixture 'seed'
    $working = Join-Path $fixture 'working copy with spaces'
    Invoke-TestGit @('init', '--bare', '--initial-branch=main', '--quiet', $remote)
    Invoke-TestGit @('init', '--initial-branch=main', '--quiet', $seed)
    Invoke-TestGit @('-C', $seed, 'config', 'user.name', 'HUD Test')
    Invoke-TestGit @('-C', $seed, 'config', 'user.email', 'hud-test@example.invalid')
    $scripts = Join-Path $seed 'training-hud'
    New-Item -ItemType Directory -Path $scripts | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'update-local.ps1') -Destination $scripts
    $child = Join-Path $scripts 'local-release.ps1'
    $oldChild = @'
param([string]$Mode, [string]$Cs2, [string]$SteamCmd, [string]$SteamUsername)
$global:HudUpdateCalls++
$global:HudUpdateVersion = 'old'
$global:HudUpdateMode = $Mode
$global:HudUpdateCs2 = $Cs2
'@
    $oldChild | Set-Content -LiteralPath $child
    Invoke-TestGit @('-C', $seed, 'add', '.')
    Invoke-TestGit @('-C', $seed, 'commit', '--quiet', '-m', 'Initial workflow')
    Invoke-TestGit @('-C', $seed, 'remote', 'add', 'origin', $remote)
    Invoke-TestGit @('-C', $seed, 'push', '--quiet', '--set-upstream', 'origin', 'main')
    Invoke-TestGit @('clone', '--quiet', $remote, $working)

    # The existing checkout must load the newly pulled workflow in this same invocation.
    $oldChild.Replace("'old'", "'new'") | Set-Content -LiteralPath $child
    Invoke-TestGit @('-C', $seed, 'add', '.')
    Invoke-TestGit @('-C', $seed, 'commit', '--quiet', '-m', 'Update local workflow')
    Invoke-TestGit @('-C', $seed, 'push', '--quiet')
    $expectedRevision = & git -C $seed rev-parse HEAD
    $script = Join-Path $working 'training-hud/update-local.ps1'
    $global:HudUpdateCalls = 0
    & $script -Cs2 'D:/Steam Library/Counter-Strike Global Offensive' | Out-Null
    $actualRevision = & git -C $working rev-parse HEAD
    Assert ($actualRevision -eq $expectedRevision) 'Arbeitskopie wurde nicht auf den aktuellen Stand gebracht.'
    Assert ($global:HudUpdateVersion -eq 'new' -and $global:HudUpdateCalls -eq 1) 'Es muss der heruntergeladene Ablauf ausgeführt werden.'
    Assert ($global:HudUpdateMode -eq 'update') 'Der normale Aufruf muss das lokale HUD aktualisieren.'
    Assert ($global:HudUpdateCs2 -eq 'D:/Steam Library/Counter-Strike Global Offensive') 'CS2-Pfad mit Leerzeichen wurde nicht weitergegeben.'

    # Divergence must fail without merging/resetting or running the HUD updater.
    Invoke-TestGit @('-C', $working, 'config', 'user.name', 'HUD Test')
    Invoke-TestGit @('-C', $working, 'config', 'user.email', 'hud-test@example.invalid')
    'local change' | Set-Content -LiteralPath (Join-Path $working 'local-note.txt')
    Invoke-TestGit @('-C', $working, 'add', '.')
    Invoke-TestGit @('-C', $working, 'commit', '--quiet', '-m', 'Local work')
    $localRevision = & git -C $working rev-parse HEAD
    'remote change' | Set-Content -LiteralPath (Join-Path $seed 'remote-note.txt')
    Invoke-TestGit @('-C', $seed, 'add', '.')
    Invoke-TestGit @('-C', $seed, 'commit', '--quiet', '-m', 'Remote work')
    Invoke-TestGit @('-C', $seed, 'push', '--quiet')
    $failed = $false
    try { & $script | Out-Null } catch {
        Assert ($_.Exception.Message -match 'Git-Update fehlgeschlagen') "Unerwarteter Fehler: $_"
        $failed = $true
    }
    Assert $failed 'Ein nicht vorspulbarer Git-Stand muss abbrechen.'
    Assert ($global:HudUpdateCalls -eq 1) 'Nach fehlgeschlagenem Git-Update darf kein HUD-Build starten.'
    $afterFailure = & git -C $working rev-parse HEAD
    Assert ($afterFailure -eq $localRevision) 'Lokale Commits dürfen nicht überschrieben werden.'

    # A later release must retain the prepared checkout rather than pull a different commit.
    & $script -Mode release | Out-Null
    Assert ($global:HudUpdateMode -eq 'release' -and $global:HudUpdateCalls -eq 2) 'Ein späterer Release muss ohne Git-Update möglich sein.'
    $afterRelease = & git -C $working rev-parse HEAD
    Assert ($afterRelease -eq $localRevision) 'Ein späterer Release darf keinen neuen Commit laden.'
    Write-Output 'Git-Ablauf geprüft: aktueller Stand, heruntergeladenes Skript, Pfade, Abbruch bei Pull-Fehler und späterer Release ohne Pull.'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
    Get-Variable -Name HudUpdate* -Scope Global | Remove-Variable -Scope Global
}
