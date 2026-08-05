@echo off
REM scripts\setup-postgres.bat
REM Creates the trazer role and database in your local Postgres.
REM Tries trust auth first (PGPASSWORD unset), then prompts for the postgres
REM superuser password if that fails. Idempotent — re-runs are no-ops.
setlocal EnableExtensions EnableDelayedExpansion

REM Find psql in PATH, then fall back to the default Postgres install dirs.
set "PSQL="
for /f "delims=" %%i in ('where psql 2^>nul') do (
  if not defined PSQL set "PSQL=%%i"
)
if not defined PSQL (
  for /d %%d in ("C:\Program Files\PostgreSQL\*") do (
    if exist "%%d\bin\psql.exe" if not defined PSQL set "PSQL=%%d\bin\psql.exe"
  )
)
if not defined PSQL (
  echo [setup-postgres] psql.exe not found. Add C:\Program Files\PostgreSQL\^<version\^>\bin to PATH and re-run.
  exit /b 1
)
echo [setup-postgres] using %PSQL%

REM SQL: idempotent CREATE USER + CREATE DATABASE (the second is conditional).
set "SQL_USER=DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trazer') THEN CREATE USER trazer WITH PASSWORD 'trazer'; END IF; END $$;"

REM --- 1) Trust auth (no password) -----------------------------------------
"%PSQL%" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "!SQL_USER!" 1>nul 2>nul
set "RC=!ERRORLEVEL!"
"%PSQL%" -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'trazer'" 1>nul 2>nul
if errorlevel 1 (
  "%PSQL%" -U postgres -d postgres -c "CREATE DATABASE trazer OWNER trazer" 1>nul 2>nul
  if errorlevel 1 set "RC=1"
)
if !RC! EQU 0 (
  echo.
  echo [setup-postgres] OK ^- trust auth worked
  echo [setup-postgres] run: node scripts\trazer.mjs dev
  endlocal & exit /b 0
)

REM --- 2) Prompt for the postgres superuser password -----------------------
echo.
echo [setup-postgres] trust auth failed. Enter the postgres superuser password
echo                (the one you set when you installed Postgres). Ctrl+C to abort.
echo.
for /f "delims=" %%i in ('powershell -NoProfile -Command "$secure = Read-Host -AsSecureString; $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)"') do set "PGPASSWORD=%%i"

if "!PGPASSWORD!"=="" (
  echo [setup-postgres] no password provided - aborting
  endlocal & exit /b 1
)

"%PSQL%" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "!SQL_USER!" 1>nul 2>nul
"%PSQL%" -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'trazer'" 1>nul 2>nul
if errorlevel 1 "%PSQL%" -U postgres -d postgres -c "CREATE DATABASE trazer OWNER trazer" 1>nul 2>nul

if errorlevel 1 (
  echo [setup-postgres] still failed - check the password and try again
  endlocal & exit /b 1
)
echo.
echo [setup-postgres] OK
echo [setup-postgres] run: node scripts\trazer.mjs dev
endlocal
