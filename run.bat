@echo off
setlocal
title AI Artifact Manager Runner 🚀

echo ==========================================
echo    AI Artifact Manager Launcher 🎬✨
echo ==========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python from https://www.python.org/
    pause
    exit /b
)

:: Install dependencies
echo [1/2] Checking dependencies... 📦
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [WARNING] Failed to install some dependencies.
    echo Trying to run anyway...
)

:: Run the application
echo [2/2] Starting application... 🚀✨
echo.
python app.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application crashed.
    pause
)

endlocal
