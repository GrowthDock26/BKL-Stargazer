@echo off
REM ---------------------------------------------------------------------------
REM Startet BKL Legal OS lokal und oeffnet den Browser.
REM
REM Prueft zuerst, ob die Server schon laufen. Ohne diese Pruefung endete jeder
REM zweite Doppelklick in zwei Fenstern voller Fehlermeldungen ("EADDRINUSE"),
REM weil die Ports belegt sind — das sah aus, als starte nichts, obwohl alles
REM lief.
REM
REM Geprueft wird per curl, NICHT per netstat: Auf einem deutschen Windows
REM meldet netstat "ABHOEREN" statt "LISTENING", jede Suche nach dem englischen
REM Wort liefe also immer ins Leere. Ausserdem sagt eine Antwort mehr aus als
REM ein belegter Port — ein haengender Prozess haelt den Port, ohne zu arbeiten.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
title BKL Legal OS - Start

echo.
echo   BKL Legal OS wird gestartet
echo   ---------------------------
echo.

set "BACKEND_LAEUFT="
set "FRONTEND_LAEUFT="
curl -s -o nul -m 3 http://localhost:3001/health && set "BACKEND_LAEUFT=1"
curl -s -o nul -m 3 http://localhost:3000/ && set "FRONTEND_LAEUFT=1"

if defined BACKEND_LAEUFT (
    echo   [ok]     Backend laeuft bereits
) else (
    echo   [start]  Backend wird gestartet ...
    start "BKL Legal OS - Backend" cmd /k "cd /d "%~dp0mike\backend" && npm run dev"
)

if defined FRONTEND_LAEUFT (
    echo   [ok]     Frontend laeuft bereits
) else (
    echo   [start]  Frontend wird gestartet ...
    start "BKL Legal OS - Frontend" cmd /k "cd /d "%~dp0mike\frontend" && npm run dev"
)

if defined BACKEND_LAEUFT if defined FRONTEND_LAEUFT goto BEREIT

echo.
echo   Warte, bis die Server antworten ...

REM Auf eine echte Antwort warten statt blind zu zaehlen: Nach einer Aenderung
REM braucht der erste Start laenger, und ein zu frueh geoeffneter Browser zeigt
REM eine Fehlerseite, die nach einem kaputten System aussieht.
set /a VERSUCHE=0
:WARTE_BACKEND
curl -s -o nul -m 2 http://localhost:3001/health && goto BACKEND_BEREIT
set /a VERSUCHE+=1
if %VERSUCHE% geq 45 goto BACKEND_FEHLT
timeout /t 1 /nobreak >nul
goto WARTE_BACKEND

:BACKEND_FEHLT
echo.
echo   [FEHLER] Das Backend antwortet nach 45 Sekunden nicht.
echo.
echo            Bitte im Fenster "BKL Legal OS - Backend" nachsehen, was dort steht.
echo            Steht dort EADDRINUSE, laeuft noch ein alter Server: alle
echo            Server-Fenster schliessen und diese Datei erneut starten.
echo.
pause
exit /b 1

:BACKEND_BEREIT
echo   [ok]     Backend antwortet
set /a VERSUCHE=0
:WARTE_FRONTEND
curl -s -o nul -m 3 http://localhost:3000/ && goto FRONTEND_BEREIT
set /a VERSUCHE+=1
if %VERSUCHE% geq 90 goto FRONTEND_FEHLT
timeout /t 1 /nobreak >nul
goto WARTE_FRONTEND

:FRONTEND_FEHLT
echo.
echo   [FEHLER] Das Frontend antwortet nach 90 Sekunden nicht.
echo            Bitte im Fenster "BKL Legal OS - Frontend" nachsehen.
echo.
pause
exit /b 1

:FRONTEND_BEREIT
echo   [ok]     Frontend antwortet

:BEREIT
echo.
echo   Browser wird geoeffnet ...
start "" "http://localhost:3000"

echo.
echo   Fertig. Beide Server laufen in eigenen Fenstern.
echo   Zum Beenden: die beiden Server-Fenster schliessen oder dort Strg+C druecken.
echo.
timeout /t 6 /nobreak >nul
endlocal
