@echo off
REM start.bat -- boots Trazer end-to-end on Windows
REM What it does:
REM   1. Verifies Node.js is on PATH
REM   2. Installs apps\web deps if node_modules is missing
REM   3. Runs the dev script (Postgres check + user/db create + API on :8080 + Web on :5173)
REM Stop the stack: Ctrl+C in this window, or run: node scripts/trazer.mjs dev stop
REM Per-process logs: %TEMP%/trazer-api.log and %TEMP%/trazer-web.log
REM (the dev script writes the API and Web child logs there automatically)

chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo [start] working dir: %CD%
echo [start] verifying Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo [start] ERROR: Node.js is required. Install it from https://nodejs.org and re-run this script.
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo [start] Node.js: %%v

if not exist "apps\web\node_modules" (
  echo [start] installing apps\web dependencies (one-time)...
  call npm install --prefix apps\web
  if errorlevel 1 (
    echo [start] ERROR: npm install failed.
    pause >nul
    exit /b 1
  )
)

echo [start] starting dev stack (api on :8080, web on :5173)...
echo.

node scripts\trazer.mjs dev

echo.
echo ====================================================
echo [start] dev script exited.
echo [start] api log: %TEMP%\trazer-api.log
echo [start] web log: %TEMP%\trazer-web.log
echo ====================================================
echo Press any key to close this window.
pause >nul
endlocal