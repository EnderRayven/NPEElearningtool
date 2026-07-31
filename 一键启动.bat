@echo off
setlocal
cd /d "%~dp0"
echo [1/4] Checking runtime...
where node >nul 2>nul
if not errorlevel 1 node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)" >nul 2>nul
if errorlevel 1 (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Node.js 22.13+ is required. Install it from https://nodejs.org/
    pause
    exit /b 1
  )
  echo Installing or upgrading Node.js 22.13+...
  winget upgrade --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  set "PATH=C:\Program Files\nodejs;%PATH%"
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=13)?0:1)" >nul 2>nul
if errorlevel 1 (
  echo Node.js is still older than 22.13. Restart Windows or update PATH, then try again.
  pause
  exit /b 1
)

echo [2/4] Checking pnpm...
where pnpm >nul 2>nul
if errorlevel 1 call npm install --global pnpm
if errorlevel 1 goto :error

echo [3/4] Installing or updating dependencies...
call pnpm install
if errorlevel 1 goto :error

echo [4/4] Starting question bank...
start "" http://127.0.0.1:5173/
call pnpm start
exit /b %errorlevel%

:error
echo.
echo Environment setup failed. Copy the error above for troubleshooting.
pause
exit /b 1
