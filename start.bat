@echo off
REM start.bat -- boots Trazer end-to-end on Windows
REM What it does:
REM   1. Checks Node.js and the .NET SDK are on PATH
REM   2. Installs apps\web deps if node_modules is missing
REM   3. Runs the dev script - Postgres check, user/db create, API on :8080, Web on :5173
REM Demo mode is off by default: a fresh install bootstraps an admin with
REM one-time credentials printed at the end (use them to finish setup).
REM Set Demo__Enabled=true before running to use the seeded demo login instead.
REM Stop the stack: Ctrl+C in this window, or run: node scripts/trazer.mjs dev stop
REM Per-process logs: %TEMP%/trazer-api.log and %TEMP%/trazer-web.log

setlocal EnableExtensions
chcp 65001 >nul

REM Grab the ESC byte via cmd's $E prompt (no raw ESC needed in the file).
for /f %%e in ('echo prompt $E ^| cmd') do set "ESC=%%e"
set "BLU=%ESC%[94m"
set "GRN=%ESC%[92m"
set "RED=%ESC%[91m"
set "ORG=%ESC%[38;5;208m"
set "RST=%ESC%[0m"

if /i "%~1"=="--run" goto :main

REM ---------------------------------------------------------------
REM Parent: title banner + run the real body as a child cmd so the
REM window NEVER closes without a keypress, even on a batch parse error.
REM ---------------------------------------------------------------
echo %BLU%████████╗██████╗  █████╗ ███████╗███████╗██████╗ %RST%
echo %BLU%╚══██╔══╝██╔══██╗██╔══██╗╚══███╔╝██╔════╝██╔══██╗%RST%
echo %BLU%   ██║   ██████╔╝███████║  ███╔╝ █████╗  ██████╔╝%RST%
echo %BLU%   ██║   ██╔══██╗██╔══██║ ███╔╝  ██╔══╝  ██╔══██╗%RST%
echo %BLU%   ██║   ██║  ██║██║  ██║███████╗███████╗██║  ██║%RST%
echo %BLU%   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝%RST%
echo %GRN%[start]%RST% Trazer boot helper - ready to start the stack
echo.

cmd /c ""%~f0" --run"
set "EXITCODE=%errorlevel%"
echo.
if "%EXITCODE%"=="0" (
  echo %GRN%[start]%RST% Stack stopped cleanly. Thanks for using Trazer.
) else (
  echo %RED%[start]%RST% Stack stopped / start aborted. If it did not stop because of you:
  echo %GRN%[start]%RST%   1. The error message printed above is the exact cause.
  echo %GRN%[start]%RST%   2. Most common: PostgreSQL not running. Start the postgresql-x64-17 service, then re-run.
  echo %GRN%[start]%RST%   3. Or ports 8080/5173 busy. Close whatever is using them, then re-run.
  echo %GRN%[start]%RST%   4. API log: %TEMP%\trazer-api.log
)
echo %GRN%[start]%RST% Closing this window now.
exit /b %EXITCODE%

:main
cd /d "%~dp0"

REM Fixed ports so the dev script never prompts for them.
if not defined TRAZER_API_PORT set "TRAZER_API_PORT=8080"
if not defined TRAZER_WEB_PORT set "TRAZER_WEB_PORT=5173"
if not defined Demo__Enabled set "Demo__Enabled=false"

echo %GRN%[start]%RST% working dir: %CD%

echo %GRN%[start]%RST% checking %GRN%Node.js%RST%...
where node >nul 2>&1
if errorlevel 1 (
  echo %RED%[start]%RST% Node.js was not found on your PATH.
  echo %GRN%[start]%RST% Install it from https://nodejs.org and run start.bat again.
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo %GRN%[start]%RST% %GRN%Node.js%RST% version: %%v

echo %GRN%[start]%RST% checking %ORG%.NET SDK%RST%...
where dotnet >nul 2>&1
if errorlevel 1 (
  echo %RED%[start]%RST% The .NET SDK was not found on your PATH.
  echo %GRN%[start]%RST% Install it from https://dotnet.microsoft.com and run start.bat again.
  exit /b 1
)
for /f "delims=" %%v in ('dotnet --version') do echo %GRN%[start]%RST% %ORG%.NET SDK%RST% version: %%v

if not exist "apps\web\node_modules" (
  echo %GRN%[start]%RST% first run: installing web dependencies - this can take a few minutes...
  call npm install --prefix apps\web
  if errorlevel 1 (
    echo %RED%[start]%RST% Installing web dependencies failed.
    echo %GRN%[start]%RST% Check the npm error above - usually a network/proxy problem - then run start.bat again.
    exit /b 1
  )
)

echo %GRN%[start]%RST% starting dev stack - api on :8080, web on :5173, Demo__Enabled=%Demo__Enabled%
echo %GRN%[start]%RST% Vite runs right here in this window - press Ctrl+C to stop the stack.
echo.

node scripts\trazer.mjs dev
set "EXITCODE=%errorlevel%"
echo.
if not "%EXITCODE%"=="0" (
  echo %RED%[start]%RST% The dev script itself failed. What to do:
  echo %GRN%[start]%RST%   1. The message printed above is the exact reason.
  echo %GRN%[start]%RST%   2. Check log: %TEMP%\trazer-api.log and %TEMP%\trazer-web.log
)
exit /b %EXITCODE%