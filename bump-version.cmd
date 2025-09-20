@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\bump-version.ps1"
endlocal
