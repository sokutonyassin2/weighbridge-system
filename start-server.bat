@echo off
echo Starting Weighbridge System Complete Suite...

:: Ensure we are in the script's directory
cd /d "%~dp0"

:: 1. Start Weighbridge Helper (Port 3000)
:: This connects to COM5 and Cameras
echo Starting Weighbridge Helper (Hardware Interface)...
start "Weighbridge Helper" cmd /k "cd Weighbridge-Helper && node Server.js"

:: Wait a bit for Helper to initialize
timeout /t 3 /nobreak >nul

:: 2. Start Main Server (Port 5000)
:: This is the backend API that talks to the Helper
echo Starting Main Application Server...
start "Main Server" cmd /k "cd server && node server.js"

:: Wait for Server
timeout /t 3 /nobreak >nul

:: 3. Start Frontend (Port 8080)
:: This is the UI you see in the browser
echo Starting Web Interface...
call npm run dev

pause