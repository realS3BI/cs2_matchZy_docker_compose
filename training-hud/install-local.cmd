@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-local.ps1" %*
if errorlevel 1 (
    echo Installation fehlgeschlagen. Die Fehlermeldung steht oben.
    pause
    exit /b 1
)
pause
