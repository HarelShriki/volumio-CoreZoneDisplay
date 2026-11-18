@echo off
title CoreZoneDisplay - Local Website Debug
cd /d "%~dp0"

echo ======================================================================
echo  CoreZoneDisplay - Local Website Debug Launcher
echo ======================================================================

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

if exist "..\submodule\clocks\MainClockSelector.html" (
    echo [OK] Clock submodule found: ..\submodule\clocks\MainClockSelector.html
) else (
    echo [WARNING: Submodule missing] ..\submodule\clocks\MainClockSelector.html not found!
    echo Run: git submodule update --init --recursive
)

echo.
echo Opening http://localhost:4004 in your default browser...
start "" "http://localhost:4004"

echo Starting local debug server on port 4004...
echo.
node dev-server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] dev-server.js exited with an error.
    pause
)
