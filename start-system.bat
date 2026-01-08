@echo off
echo Starting Weighbridge System...

REM Start your existing helper program first (on port 3000)
echo Make sure your helper program is running on port 3000

REM Start the hardware integration server in the background
start "Hardware Integration Server" cmd /k "cd server && node server.js"

REM Wait a moment for the server to start
timeout /t 3 /nobreak >nul

REM Start the frontend development server
cd ..
npm run dev

pause