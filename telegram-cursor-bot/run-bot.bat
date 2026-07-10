@echo off
REM Relaunch in a minimized window (first launch is only a launcher)
if /i not "%~1"=="min" (
    start "" /min cmd /k "%~f0" min
    exit /b
)

cd /d "%~dp0"
title Telegram Cursor Bot
node bot.js
