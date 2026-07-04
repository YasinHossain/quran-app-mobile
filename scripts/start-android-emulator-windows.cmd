@echo off
rem /b keeps QEMU attached to this hidden console instead of opening Windows Terminal.
start "" /b "%~1" -avd "%~2" >nul 2>&1
