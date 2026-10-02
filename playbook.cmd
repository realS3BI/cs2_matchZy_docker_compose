@echo off
setlocal
chcp 65001 >nul
rem Read the whole block before git pull can update this launcher.
(
    where git.exe >nul 2>nul
    if errorlevel 1 (
        echo Git fehlt. Bitte Git for Windows installieren und diese Datei erneut starten.
        pause
        exit /b 1
    )

    echo [1/4] Projekt aktualisieren ...
    git -C "%~dp0." pull --ff-only
    if errorlevel 1 (
        echo Git-Update fehlgeschlagen. Bitte die Meldung oben, den aktuellen Branch und lokale Änderungen prüfen.
        pause
        exit /b 1
    )

    "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0playbook-desktop\build-and-run.ps1"
    if errorlevel 1 (
        echo Der Vorgang wurde abgebrochen. Die Fehlermeldung steht oben.
        pause
        exit /b 1
    )
    exit /b 0
)
