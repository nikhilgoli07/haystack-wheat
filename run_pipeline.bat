@echo off
REM Double-click to refresh all wheat data from USDA and rebuild the website data.
REM Pass any argument (e.g. "run_pipeline.bat auto") to skip the pause - for Task Scheduler.
REM Log is written to pipeline_last_run.log next to this file.
cd /d "%~dp0"
call :findpython || (echo Python 3 not found - install it from python.org & if "%~1"=="" pause & exit /b 9)
"%PY%" pipeline\run_pipeline.py > pipeline_last_run.log 2>&1
set RC=%ERRORLEVEL%
type pipeline_last_run.log
if not "%RC%"=="0" (echo. & echo *** PIPELINE FAILED - see pipeline_last_run.log ***)
if "%~1"=="" pause
exit /b %RC%

:findpython
REM Prefer a real install over the Microsoft Store "python" placeholder.
set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if exist "%PY%" exit /b 0
for %%P in (py python) do (%%P -c "import sys" >nul 2>nul && (set "PY=%%P" & exit /b 0))
exit /b 1
