# AI Kanban Board - PowerShell Start Script
# This script starts both the MCP backend and React frontend

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   AI Kanban Board - Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the directory where this script is located (project root)
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ProjectDir "backend"

# Function to check if command exists
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Check Python
if (-not (Test-Command "python")) {
    Write-Host "[ERROR] Python is not installed or not in PATH" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check npm
if (-not (Test-Command "npm")) {
    Write-Host "[ERROR] npm is not installed or not in PATH" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Install Python dependencies
Write-Host "[1/4] Installing Python dependencies..." -ForegroundColor Yellow
Push-Location $BackendDir
pip install -r requirements.txt --quiet
Pop-Location

# Install npm dependencies if needed
if (-not (Test-Path "$ProjectDir\node_modules")) {
    Write-Host "[2/4] Installing npm dependencies..." -ForegroundColor Yellow
    Push-Location $ProjectDir
    npm install
    Pop-Location
} else {
    Write-Host "[2/4] npm dependencies already installed" -ForegroundColor Green
}

# Start backend server
Write-Host "[3/4] Starting MCP Backend Server (port 8765)..." -ForegroundColor Yellow
$backendJob = Start-Process -FilePath "python" -ArgumentList "$BackendDir\mcp_server.py" -WorkingDirectory $ProjectDir -PassThru -WindowStyle Normal

# Wait for backend to start
Start-Sleep -Seconds 2

# Check if backend is running
if ($backendJob.HasExited) {
    Write-Host "[ERROR] Backend failed to start!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Start frontend dev server
Write-Host "[4/4] Starting React Frontend (port 5173)..." -ForegroundColor Yellow
$frontendJob = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $ProjectDir -PassThru -WindowStyle Normal

# Check if frontend started
Start-Sleep -Seconds 1
if ($null -eq $frontendJob -or $frontendJob.HasExited) {
    Write-Host "[ERROR] Frontend failed to start!" -ForegroundColor Red
    Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Both servers are running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "   MCP Backend:    http://localhost:8765" -ForegroundColor Cyan
Write-Host "   React Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Press Ctrl+C or close this window to stop both servers." -ForegroundColor Yellow
Write-Host ""

# Wait and monitor
try {
    while ($true) {
        if ($backendJob.HasExited) {
            Write-Host "[WARNING] Backend server exited" -ForegroundColor Red
            break
        }
        if ($null -ne $frontendJob -and $frontendJob.HasExited) {
            Write-Host "[WARNING] Frontend server exited" -ForegroundColor Red
            break
        }
        Start-Sleep -Seconds 1
    }
} finally {
    # Cleanup
    Write-Host ""
    Write-Host "Shutting down servers..." -ForegroundColor Yellow
    
    if (-not $backendJob.HasExited) {
        Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $frontendJob -and -not $frontendJob.HasExited) {
        Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "Done." -ForegroundColor Green
}
