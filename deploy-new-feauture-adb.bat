@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "ADB=adb"

where "%ADB%" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] adb not found in PATH.
  echo Install Android Platform Tools and ensure adb.exe is available.
  exit /b 1
)

echo [INFO] Checking ADB device...
"%ADB%" start-server >nul 2>&1
"%ADB%" wait-for-device

for /f "tokens=1,2" %%A in ('"%ADB%" devices ^| findstr /R "^[A-Za-z0-9].*device$"') do set "DEVICE_ID=%%A"
if not defined DEVICE_ID (
  echo [ERROR] No ADB device in "device" state found.
  echo Run: adb devices
  exit /b 1
)
echo [INFO] Using device: %DEVICE_ID%

echo [INFO] Preparing target folders...
"%ADB%" shell "mkdir -p /opt/scripts/watchdog /opt/scripts/ttl /etc/init.d /lib/systemd/system /lib/systemd/system/multi-user.target.wants"
if errorlevel 1 goto :fail

echo [INFO] Pushing scripts...
"%ADB%" push "scripts\watchdog\connection-watchdog" "/opt/scripts/watchdog/connection-watchdog"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\ttl\ttl-override" "/opt/scripts/ttl/ttl-override"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\ttl\ttlvalue" "/opt/scripts/ttl/ttlvalue"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\init.d\crontab" "/etc/init.d/crontab"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\systemd\connection-watchdog.service" "/lib/systemd/system/connection-watchdog.service"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\systemd\crontab.service" "/lib/systemd/system/crontab.service"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\systemd\ttl-override.service" "/lib/systemd/system/ttl-override.service"
if errorlevel 1 goto :fail
"%ADB%" push "scripts\systemd\euicc.service" "/lib/systemd/system/euicc.service"
if errorlevel 1 goto :fail

echo [INFO] Setting permissions...
"%ADB%" shell "chmod 755 /opt/scripts/watchdog/connection-watchdog /opt/scripts/ttl/ttl-override /opt/scripts/ttl/ttlvalue /etc/init.d/crontab /lib/systemd/system/connection-watchdog.service /lib/systemd/system/crontab.service /lib/systemd/system/ttl-override.service /lib/systemd/system/euicc.service"
if errorlevel 1 goto :fail

echo [INFO] Ensuring systemd symlinks...
"%ADB%" shell "ln -sf /lib/systemd/system/crontab.service /lib/systemd/system/multi-user.target.wants/crontab.service"
if errorlevel 1 goto :fail
"%ADB%" shell "ln -sf /lib/systemd/system/ttl-override.service /lib/systemd/system/multi-user.target.wants/ttl-override.service"
if errorlevel 1 goto :fail
"%ADB%" shell "ln -sf /lib/systemd/system/connection-watchdog.service /lib/systemd/system/multi-user.target.wants/connection-watchdog.service"
if errorlevel 1 goto :fail

echo [INFO] Reloading services...
"%ADB%" shell "systemctl daemon-reload"
"%ADB%" shell "systemctl enable connection-watchdog.service"
if errorlevel 1 goto :fail
"%ADB%" shell "systemctl start connection-watchdog.service"
if errorlevel 1 goto :fail
"%ADB%" shell "systemctl start crontab"
if errorlevel 1 goto :fail

echo [OK] Deploy completed.
echo [INFO] Verify:
echo   adb shell systemctl status connection-watchdog.service --no-pager
echo   adb shell systemctl status crontab --no-pager
echo   adb shell tail -n 30 /tmp/connection-watchdog.log
exit /b 0

:fail
echo [ERROR] Deploy failed at previous step.
exit /b 1
