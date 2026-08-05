@echo off
REM start.bat -- boots Trazer end-to-end
REM 1. Verify Node is installed
REM 2. Install apps\web deps if node_modules is missing
REM 3. Run the dev script (Postgres check + user/db create + API + web)
REM Stop: Ctrl+C in this window. The window stays open on crash so you
REM can read the error, and a full log is written to %TEMP%\trazer-start.log
REM so you can re-read it after closing.
setlocal EnableExtensions EnableDelayedExpansion

set "LOG=%TEMP%\trazer-start.log"
echo Trazer start log - %DATE% %TIME% > "%LOG%"

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [start] Node.js is required. Install from https://nodejs.org and re-run this script.
  echo [start] Node.js is required. Install from https://nodejs.org and re-run this script.>> "%LOG%"
  pause
  exit /b 1
)

if not exist "apps\web\node_modules" (
  echo [start] installing apps\web dependencies...
  echo [start] installing apps\web dependencies...>> "%LOG%"
  call npm install --prefix apps\web >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo [start] npm install failed. Full log: %LOG%
    echo [start] npm install failed. Full log: %LOG%>> "%LOG%"
    pause
    exit /b 1
  )
)

node scripts\trazer.mjs dev > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"

echo.
echo [start] dev script exited (code !RC!).
echo [start] full log: %LOG%
if !RC! NEQ 0 pause
endlocal
