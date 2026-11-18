@echo off
title CoreZoneDisplay - Clock Screensaver Debug
cd /d "%~dp0"

echo ======================================================================
echo  CoreZoneDisplay - Direct Clock Screensaver Launcher
echo ======================================================================

if exist "..\submodule\clocks\MainClockSelector.html" (
    echo [OK] Clock submodule found: ..\submodule\clocks\MainClockSelector.html
) else (
    echo [WARNING: Submodule missing] ..\submodule\clocks\MainClockSelector.html not found!
)

echo Opening http://localhost:4004/clocks/MainClockSelector.html ...
start "" "http://localhost:4004/clocks/MainClockSelector.html"

netstat -ano | findstr ":4004 " | findstr "LISTENING" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Local debug server is not running yet. Starting dev-server.js on port 4004...
    echo.
    node dev-server.js
)
