@echo off
setlocal
title AI Artifact Manager Builder 🏗️

echo ==========================================
echo    AI Artifact Manager Builder 📦✨
echo ==========================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed.
    pause
    exit /b
)

:: Install PyInstaller
echo [1/3] Installing build tools... 📦
pip install pyinstaller eel mutagen bottle --quiet

:: Build the application
echo [2/3] Building EXE (this may take a minute)... 🏗️
echo.

:: Using eel's packager which wraps PyInstaller
:: --onedir is faster to start and more stable for local file access
python -m eel app.py web --onedir --name AIArtifactManager --noconsole --icon NONE

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b
)

echo.
echo [3/3] Build complete! 🎉
echo Output folder: dist\AIArtifactManager
echo.
echo Tips: 配布する際は dist\AIArtifactManager フォルダごと配布してください。✨
echo.
pause
endlocal
