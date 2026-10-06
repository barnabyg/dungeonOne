@echo off
rem Install (first run only), build and launch Dungeon One in the browser.
rem Arguments go to the launcher: run --seed 0 --characters .\.scratch\play\characters.json
rem Set OPENAI_API_KEY in the environment beforehand to enable the AI Dungeon Master.
setlocal
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto failed
)

call npm.cmd run build
if errorlevel 1 goto failed

call npm.cmd run browser -- %*
if errorlevel 1 goto failed
exit /b 0

:failed
set "status=%errorlevel%"
echo.
echo run.bat stopped: the step above failed with exit code %status%.
rem Started by double-click or from PowerShell (not an open cmd prompt): keep the window readable.
echo %cmdcmdline% | find /i "%~nx0" >nul && pause
exit /b %status%
