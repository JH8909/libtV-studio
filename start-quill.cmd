@echo off
setlocal
cd /d "%~dp0"
set "PORT=3342"
set "URL=http://127.0.0.1:%PORT%/"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'node' -ArgumentList 'standalone\server.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
  for /l %%I in (1,1,30) do (
    powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
    if not errorlevel 1 goto open_page
    timeout /t 1 /nobreak >nul
  )
  echo QUill did not start on port %PORT%.
  exit /b 1
)

:open_page
start "" "%URL%"
exit /b 0
