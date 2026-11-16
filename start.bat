@echo off
cd /d "%~dp0"
set "PY=%~dp0.venv\bin\python.exe"
if not exist "%PY%" set "PY=%~dp0.venv\Scripts\python.exe"
echo.
echo Сайт: http://127.0.0.1:8765
echo Кабинет магазина: florist / pole-demo
echo Закрыть сайт: Ctrl+C в этом окне
echo.
start "" "http://127.0.0.1:8765"
"%PY%" "%~dp0server.py"
pause
