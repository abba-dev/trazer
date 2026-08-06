@echo off
REM Build trazer-admin.exe (GUI) from trazer-admin.py in the repo root.
REM Prereq: Python 3.10+ on PATH. One-off setup: pip install pyinstaller
setlocal
cd /d "%~dp0"
where python >nul 2>&1
if errorlevel 1 (
  echo [build] Python not found on PATH. Install from https://python.org
  exit /b 1
)
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
  echo [build] Installing pyinstaller...
  pip install pyinstaller
  if errorlevel 1 (
    echo [build] pip install failed. Check your network/proxy, then re-run.
    exit /b 1
  )
)
python -m PyInstaller --onefile --windowed --name trazer-admin --distpath dist trazer-admin.py
if errorlevel 1 (
  echo [build] PyInstaller failed - see output above.
  exit /b 1
)
echo [build] Done: dist\trazer-admin.exe