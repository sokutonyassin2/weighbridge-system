@echo off
:: Wait for network to be ready
timeout /t 10 /nobreak >nul

:: Resurrect PM2 processes
"C:\Users\Administrator\AppData\Roaming\npm\pm2.cmd" resurrect
