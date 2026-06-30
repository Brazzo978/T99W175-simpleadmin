@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "PAYLOAD_ARCHIVE=%SCRIPT_DIR%simpleadmin-1.0.5-payload.tar.gz"
set "REMOTE_ARCHIVE=/tmp/simpleadmin-1.0.5-payload.tar.gz"
set "REMOTE_DIR=/tmp/simpleadmin-1.0.5-payload"

if not "%~1"=="" set "PAYLOAD_ARCHIVE=%~1"

where adb >nul 2>&1
if errorlevel 1 (
  echo [simpleadmin-deploy][ERROR] adb not found in PATH.
  exit /b 1
)

if not exist "%PAYLOAD_ARCHIVE%" (
  echo [simpleadmin-deploy][ERROR] Payload archive not found: "%PAYLOAD_ARCHIVE%"
  exit /b 1
)

echo [simpleadmin-deploy] Waiting for ADB device
adb wait-for-device
if errorlevel 1 exit /b 1

echo [simpleadmin-deploy] Connected devices:
adb devices -l

echo [simpleadmin-deploy] Pushing payload archive to modem
adb push "%PAYLOAD_ARCHIVE%" "%REMOTE_ARCHIVE%"
if errorlevel 1 exit /b 1

echo [simpleadmin-deploy] Extracting payload and running modem-side upgrade
adb shell "cd /tmp && rm -rf %REMOTE_DIR% && tar -xzf %REMOTE_ARCHIVE% && sh %REMOTE_DIR%/upgrade-to-1.0.5.sh"
if errorlevel 1 exit /b 1

echo [simpleadmin-deploy] Done
exit /b 0
