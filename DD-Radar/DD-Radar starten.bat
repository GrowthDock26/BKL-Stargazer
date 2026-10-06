@echo off
rem Startet die grafische Oberflaeche des DD-Radar.
cd /d "%~dp0"

where pythonw >nul 2>&1
if errorlevel 1 (
    echo Python wurde nicht gefunden. Bitte Python 3.11 oder neuer installieren.
    pause
    exit /b 1
)

start "" pythonw "dd_radar_gui.pyw"
