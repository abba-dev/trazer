@echo off
REM start.bat — boots Trazer end-to-end
REM 1. Verify Node is installed
REM 2. Install apps\web deps if node_modules is missing
REM 3. Run the dev script (Postgres check + user/db create + API + web)
REM Stop: Ctrl+C in this window.
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [start] Node.js is required. Install from https://nodejs.org and re-run this script.
  pause
  exit /b 1
)

if not exist "apps\web\node_modules" (
  echo [start] installing apps\web dependencies...
  call npm install --prefix apps\web
  if errorlevel 1 (
    echo [start] npm install failed.
    pause
    exit /b 1
  )
)

node scripts\trazer.mjs dev
