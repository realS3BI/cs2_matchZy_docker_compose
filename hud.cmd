@echo off
setlocal
chcp 65001 >nul
rem Read the whole block before git pull can update this launcher.
(
    where pwsh.exe >nul 2>nul
    if errorlevel 1 (
        if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" (
            "%ProgramFiles%\PowerShell\7\pwsh.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0training-hud\update-local.ps1" %*
        ) else (
            echo PowerShell 7 fehlt. In Windows PowerShell installieren:
            echo winget install --id Microsoft.PowerShell --source winget
            pause
            exit /b 1
        )
    ) else (
        pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0training-hud\update-local.ps1" %*
    )
    if errorlevel 1 (
        echo Der Vorgang ist fehlgeschlagen. Die Fehlermeldung steht oben.
        pause
        exit /b 1
    )
    exit /b 0
)
