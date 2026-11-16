@echo off
REM Opens the dashboard locally at http://localhost:8765  (close this window to stop)
cd /d "%~dp0"
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PY%" set "PY=python"
start "" http://localhost:8765
"%PY%" -m http.server 8765 --directory site
