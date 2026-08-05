@echo off
REM start.bat — boots Trazer (api on :8080, web on :5173)
REM Requires: Node 18+, Postgres listening on localhost:5432
REM Stop: Ctrl+C in this window.
cd /d "%~dp0"
node scripts\trazer.mjs dev
