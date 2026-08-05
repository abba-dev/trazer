@echo off
REM start.bat -- boots Trazer end-to-end on Windows
REM What it does:
REM   1. Verifies Node.js is on PATH
REM   2. Installs apps\web deps if node_modules is missing
REM   3. Runs the dev script (Postgres check + user/db create + API on :8080 + Web on :5173)
REM Stop the stack: Ctrl+C in this window, or run: node scripts\trazer.mjs dev stop
REM Logs: %TEMP%\trazer-start.log (this window's stdout) and %TEMP%\trazer-{api,web}.log

chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "LOG=%TEMP%\trazer-start.log"
echo Trazer start log - %DATE% %TIME% > "%LOG%"

cd /d "%~dp0"

echo [start] working dir: %CD%
echo [start] verifying Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo [start] ERROR: Node.js is required. Install it from https://nodejs.org and re-run this script.
  echo [start] ERROR: Node.js is required.>> "%LOG%"
  echo.
  echo Press any key to close...
  pause >nul
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo [start] Node.js: %%v

if not exist "apps\web\node_modules" (
  echo [start] installing apps\web dependencies (one-time)...
  echo [start] installing apps\web dependencies...>> "%LOG%"
  call npm install --prefix apps\web >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo [start] ERROR: npm install failed. Full log: %LOG%
    pause >nul
    exit /b 1
  )
)

echo [start] starting dev stack (api on :8080, web on :5173)...
echo [start] starting dev stack...>> "%LOG%"
echo.

node scripts\trazer.mjs dev > "%LOG%" 2>&1
set "RC=%ERRORLEVEL%"

echo.
echo ====================================================
echo [start] dev script exited (code !RC!).
echo [start] full log: %LOG%
echo [start] api log: %TEMP%\trazer-api.log
echo [start] web log: %TEMP%\trazer-web.log
echo ====================================================
echo Press any key to close this window.
pause >nul
endlocal