@echo off
echo ==========================================
echo Starting Weighbridge CENTRAL SERVER
echo ==========================================
echo Port: 5000 (API)
echo Port: 8080 (Web UI)
echo ==========================================

:: Ensure we are in the script's directory
cd /d "%~dp0"

:: 1. Start Main Server (Port 5000)
echo Starting Main Application Server...
start "Main Server" cmd /k "cd server && node server.js"

:: Wait for Server
timeout /t 3 /nobreak >nul

:: 2. Start Frontend (Port 8080)
echo Starting Web Interface...
npm run dev

pause
