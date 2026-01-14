"""
AI Kanban Board - Start Script
Starts the MCP backend server and React frontend together.
"""

import subprocess
import sys
import os
import time
import signal
import threading
from pathlib import Path

# Colors for console output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_banner():
    """Print startup banner."""
    print(f"""
{Colors.CYAN}{Colors.BOLD}
    ╔═══════════════════════════════════════════════════════╗
    ║           AI Kanban Board - Startup Script            ║
    ╠═══════════════════════════════════════════════════════╣
    ║  MCP Backend: http://localhost:8765                   ║
    ║  React Frontend: http://localhost:5173                ║
    ╚═══════════════════════════════════════════════════════╝
{Colors.ENDC}""")

def check_python_packages():
    """Check if required Python packages are installed."""
    required = ['fastapi', 'uvicorn', 'pydantic']
    missing = []
    
    for package in required:
        try:
            __import__(package)
        except ImportError:
            missing.append(package)
    
    return missing

def install_python_packages(packages):
    """Install missing Python packages."""
    print(f"{Colors.YELLOW}Installing missing Python packages: {', '.join(packages)}{Colors.ENDC}")
    subprocess.run([sys.executable, '-m', 'pip', 'install'] + packages, check=True)

def check_node_modules(project_dir):
    """Check if node_modules exists."""
    return (project_dir / 'node_modules').exists()

def install_npm_packages(project_dir):
    """Install npm packages."""
    print(f"{Colors.YELLOW}Installing npm packages...{Colors.ENDC}")
    subprocess.run(['npm', 'install'], cwd=project_dir, check=True, shell=True)

def stream_output(process, prefix, color):
    """Stream output from a process with a prefix."""
    for line in iter(process.stdout.readline, ''):
        if line:
            print(f"{color}[{prefix}]{Colors.ENDC} {line.rstrip()}")

def start_backend(project_dir):
    """Start the MCP backend server."""
    backend_script = project_dir / 'backend' / 'mcp_server.py'
    
    print(f"{Colors.GREEN}Starting MCP Backend Server...{Colors.ENDC}")
    
    process = subprocess.Popen(
        [sys.executable, str(backend_script)],
        cwd=project_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Stream output in background thread
    thread = threading.Thread(
        target=stream_output,
        args=(process, 'Backend', Colors.BLUE),
        daemon=True
    )
    thread.start()
    
    return process

def start_frontend(project_dir):
    """Start the React frontend dev server."""
    print(f"{Colors.GREEN}Starting React Frontend...{Colors.ENDC}")
    
    process = subprocess.Popen(
        ['npm', 'run', 'dev'],
        cwd=project_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        shell=True
    )
    
    # Stream output in background thread
    thread = threading.Thread(
        target=stream_output,
        args=(process, 'Frontend', Colors.CYAN),
        daemon=True
    )
    thread.start()
    
    return process

def main():
    """Main entry point."""
    # Get project directory (parent of this script's directory)
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    
    print_banner()
    
    # Check and install Python dependencies
    missing_packages = check_python_packages()
    if missing_packages:
        install_python_packages(missing_packages)
    
    # Check and install npm dependencies
    if not check_node_modules(project_dir):
        install_npm_packages(project_dir)
    
    # Store processes for cleanup
    processes = []
    
    def cleanup(signum=None, frame=None):
        """Clean up processes on exit."""
        print(f"\n{Colors.YELLOW}Shutting down...{Colors.ENDC}")
        for p in processes:
            try:
                p.terminate()
                p.wait(timeout=5)
            except:
                p.kill()
        sys.exit(0)
    
    # Register signal handlers
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    try:
        # Start backend first
        backend_process = start_backend(project_dir)
        processes.append(backend_process)
        
        # Wait a bit for backend to start
        time.sleep(2)
        
        # Check if backend started successfully
        if backend_process.poll() is not None:
            print(f"{Colors.RED}Backend failed to start!{Colors.ENDC}")
            cleanup()
            return
        
        # Start frontend
        frontend_process = start_frontend(project_dir)
        processes.append(frontend_process)
        
        print(f"\n{Colors.GREEN}{Colors.BOLD}✓ Both servers are running!{Colors.ENDC}")
        print(f"{Colors.CYAN}Press Ctrl+C to stop both servers.{Colors.ENDC}\n")
        
        # Wait for processes
        while True:
            time.sleep(1)
            
            # Check if any process died
            for p in processes:
                if p.poll() is not None:
                    print(f"{Colors.RED}A server process exited unexpectedly.{Colors.ENDC}")
                    cleanup()
                    return
    
    except KeyboardInterrupt:
        cleanup()
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.ENDC}")
        cleanup()

if __name__ == '__main__':
    main()
