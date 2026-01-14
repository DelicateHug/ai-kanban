@echo off
REM AI Kanban Board - Windows Start Script
REM This script starts both the MCP backend and React frontend

echo.
echo ========================================
echo   AI Kanban Board - Startup
echo ========================================
echo.

REM Get the directory of this script (project root)
set "PROJECT_DIR=%~dp0"
set "BACKEND_DIR=%PROJECT_DIR%backend"

REM Check if Python is available
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Install Python dependencies
echo [1/4] Installing Python dependencies...
cd "%BACKEND_DIR%"
pip install -r requirements.txt --quiet

REM Check if npm is available
npm --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed or not in PATH
    pause
    exit /b 1
)

REM Install npm dependencies if needed
if not exist "%PROJECT_DIR%node_modules" (
    echo [2/4] Installing npm dependencies...
    cd "%PROJECT_DIR%"
    npm install
) else (
    echo [2/4] npm dependencies already installed
)

REM Start backend server in new window (run from project root for correct relative paths)
echo [3/4] Starting MCP Backend Server (port 8765)...
start "MCP Backend" cmd /c "cd /d "%PROJECT_DIR%" && python "%BACKEND_DIR%\mcp_server.py""

REM Wait for backend to start
timeout /t 2 /nobreak >nul

REM Start frontend dev server
echo [4/4] Starting React Frontend (port 5173)...
cd "%PROJECT_DIR%"
start "React Frontend" cmd /c "npm run dev"

echo.
echo ========================================
echo   Both servers are starting!
echo ========================================
echo.
echo   MCP Backend:    http://localhost:8765
echo   React Frontend: http://localhost:5173
echo.
echo   Close the terminal windows to stop.
echo.
pause
