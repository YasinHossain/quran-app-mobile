@echo off
rem /b keeps QEMU attached to this hidden console instead of opening Windows Terminal.
start "" /b "%~1" %2 %3 %4 %5 >nul 2>&1
