# AI Kanban Board - PowerShell Start Script
# This script starts both the MCP backend and React frontend

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   AI Kanban Board - Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Instructions for users
Write-Host "This script will:"
Write-Host "  - Install Python if not present"
Write-Host "  - Install Node.js (for npm) if not present"
Write-Host "  - Create a Python virtual environment if needed"
Write-Host "  - Install all required packages"
Write-Host "  - Start the backend and frontend servers"
Write-Host ""
Write-Host "If installations fail, you may need to install manually:"
Write-Host "  - Python: Download from https://python.org or use winget install python.python"
Write-Host "  - Node.js: Download from https://nodejs.org or use winget install OpenJS.NodeJS"
Write-Host ""

# Get the directory where this script is located (project root)
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ProjectDir "backend"
$VenvDir = Join-Path $ProjectDir ".venv"

# Function to check if command exists
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Function to install via winget
function Install-WithWinget($package, $name) {
    if (Test-Command "winget") {
        Write-Host "Installing $name via winget..." -ForegroundColor Yellow
        try {
            winget install $package --silent --accept-source-agreements --accept-package-agreements
            return $true
        } catch {
            Write-Host "Failed to install $name via winget. Please install manually." -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "winget not available. Please install $name manually." -ForegroundColor Red
        return $false
    }
}

# Check and install Python
if (-not (Test-Command "python")) {
    Write-Host "[ERROR] Python is not installed or not in PATH" -ForegroundColor Red
    if (Install-WithWinget "python.python" "Python") {
        # Refresh PATH or restart might be needed, but try
        Write-Host "Python installed. Please restart PowerShell and run this script again." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    } else {
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check and install Node.js (for npm)
if (-not (Test-Command "npm")) {
    Write-Host "[ERROR] npm is not installed or not in PATH" -ForegroundColor Red
    if (Install-WithWinget "OpenJS.NodeJS" "Node.js") {
        Write-Host "Node.js installed. Please restart PowerShell and run this script again." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    } else {
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Create virtual environment if it doesn't exist
if (-not (Test-Path $VenvDir)) {
    Write-Host "[1/5] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

# Activate virtual environment
Write-Host "[2/5] Activating virtual environment..." -ForegroundColor Yellow
& "$VenvDir\Scripts\Activate.ps1"

# Install Python dependencies
Write-Host "[3/5] Installing Python dependencies..." -ForegroundColor Yellow
Push-Location $BackendDir
pip install -r requirements.txt --quiet
Pop-Location

# Install npm dependencies
Write-Host "[4/5] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $ProjectDir
npm install
Pop-Location

# Start backend server
Write-Host "[5/6] Starting MCP Backend Server (port 8765)..." -ForegroundColor Yellow
$backendJob = Start-Process -FilePath "$VenvDir\Scripts\python.exe" -ArgumentList "$BackendDir\mcp_server.py" -WorkingDirectory $ProjectDir -PassThru -WindowStyle Normal

# Wait for backend to start
Start-Sleep -Seconds 2

# Check if backend is running
if ($backendJob.HasExited) {
    Write-Host "[ERROR] Backend failed to start!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Start frontend dev server
Write-Host "[6/6] Starting React Frontend (port 5173)..." -ForegroundColor Yellow
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
