@echo off
:: Wait for network and system to be ready
timeout /t 10 /nobreak >nul

:: Resurrect PM2 processes
pm2 resurrect
