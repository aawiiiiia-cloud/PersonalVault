@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "WORKBENCH_PORT=4173"
node server.mjs
pause
