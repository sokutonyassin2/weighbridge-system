@echo off
echo ==========================================
echo Starting Weighbridge STATION (Helper)
echo ==========================================
echo Scaling indicator: COM6
echo Port: 3000
echo ==========================================

:: Ensure we are in the script's directory
cd /d "%~dp0"

:: Start Weighbridge Helper
cd Weighbridge-Helper && node Server.js

pause
