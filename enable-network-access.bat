@echo off
echo Configuring Windows Firewall for Weighbridge System...

:: Open Port 8080 (Frontend)
netsh advfirewall firewall add rule name="Weighbridge Web Interface" dir=in action=allow protocol=TCP localport=8080

:: Open Port 5000 (Backend Server)
netsh advfirewall firewall add rule name="Weighbridge Main Server" dir=in action=allow protocol=TCP localport=5000

:: Open Port 3000 (Hardware Helper - Optional if accessed purely locally, but safe to add)
netsh advfirewall firewall add rule name="Weighbridge Helper" dir=in action=allow protocol=TCP localport=3000

echo.
echo Firewall rules added successfully!
echo.
echo ========================================================
echo       HOW TO CONNECT FROM OTHER COMPUTERS
echo ========================================================
echo.
echo 1. Find your IP Address below (Look for IPv4 Address):
ipconfig | findstr "IPv4"
echo.
echo 2. On the other computer, open Chrome/Edge and type:
echo    http://[YOUR-IP-ADDRESS]:8080
echo.
echo    Example: http://192.168.1.15:8080
echo.
pause
