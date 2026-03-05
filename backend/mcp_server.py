"""
MCP Backend Server - Executes system commands for the AI Kanban Board
This server provides API endpoints for MCP tools that require system access.
"""

import subprocess
import platform
import socket
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="MCP Backend Server", version="1.0.0")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class CommandRequest(BaseModel):
    command: str

class CommandResponse(BaseModel):
    success: bool
    output: Optional[str] = None
    error: Optional[str] = None

class ToolCallRequest(BaseModel):
    tool: str
    input: dict
    # Sandbox settings - optional for backward compatibility
    allowedPath: Optional[str] = None  # If set, file operations are restricted to this path
    allowExternal: bool = True  # If False and allowedPath is set, block external access

class ToolCallResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    sandboxViolation: bool = False  # True if the tool was blocked due to path restrictions

# Path sandbox validation
def normalize_path(path: str) -> str:
    """Normalize a path for comparison (handle Windows/Unix differences)."""
    return path.replace("\\", "/").lower()

def is_path_within_folder(target_path: str, folder_path: str) -> bool:
    """Check if a target path is within a folder."""
    import os
    
    # Resolve to absolute paths to handle relative paths
    try:
        abs_target = os.path.abspath(target_path)
        abs_folder = os.path.abspath(folder_path)
    except:
        return False
    
    normalized_target = normalize_path(abs_target)
    normalized_folder = normalize_path(abs_folder)
    
    # Ensure folder path ends with /
    folder_with_slash = normalized_folder if normalized_folder.endswith("/") else normalized_folder + "/"
    
    return normalized_target.startswith(folder_with_slash) or normalized_target == normalized_folder

def validate_path_access(path: str, allowed_path: Optional[str], allow_external: bool) -> tuple[bool, str]:
    """
    Validate if a path access is allowed based on sandbox settings.
    Returns (allowed, reason).
    """
    # If no allowed_path or external access is permitted, allow all
    if allowed_path is None or allow_external:
        return True, ""
    
    # Check if path is within allowed folder
    if is_path_within_folder(path, allowed_path):
        return True, ""
    
    return False, f'Path "{path}" is outside allowed folder "{allowed_path}". Enable "Allow External Access" to access files outside the project.'

# Tool Handlers
async def execute_command(command: str, timeout: int = 30) -> CommandResponse:
    """Execute a system command and return the output."""
    try:
        # Use shell=True on Windows for built-in commands
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            return CommandResponse(success=False, error=f"Command timed out after {timeout} seconds")
        
        output = stdout.decode('utf-8', errors='replace')
        if stderr:
            error_output = stderr.decode('utf-8', errors='replace')
            if error_output and process.returncode != 0:
                return CommandResponse(success=False, output=output, error=error_output)
        
        return CommandResponse(success=True, output=output)
    except Exception as e:
        return CommandResponse(success=False, error=str(e))

async def get_hostname() -> ToolCallResponse:
    """Get the hostname of the current machine."""
    try:
        hostname = socket.gethostname()
        return ToolCallResponse(success=True, data={"hostname": hostname})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def get_ipconfig(adapter: Optional[str] = None, include_raw: bool = False) -> ToolCallResponse:
    """Get network configuration details."""
    try:
        if platform.system() == "Windows":
            result = await execute_command("ipconfig /all")
        else:
            result = await execute_command("ifconfig -a")
        
        if not result.success:
            return ToolCallResponse(success=False, error=result.error)
        
        # Parse the output into structured data
        adapters = parse_ipconfig_output(result.output or "")
        
        # Filter by adapter name if specified
        if adapter:
            adapters = [a for a in adapters if adapter.lower() in a.get("name", "").lower()]
        
        data = {"adapters": adapters}
        if include_raw:
            data["rawOutput"] = result.output
        
        return ToolCallResponse(success=True, data=data)
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

def parse_ipconfig_output(output: str) -> List[dict]:
    """Parse ipconfig output into structured adapter data."""
    adapters = []
    current_adapter = None
    
    lines = output.split('\n')
    for line in lines:
        line = line.rstrip()
        
        # Check for adapter header (Windows format)
        if 'adapter' in line.lower() and line.endswith(':'):
            if current_adapter:
                adapters.append(current_adapter)
            
            # Extract adapter type and name
            parts = line.replace(':', '').split(' adapter ')
            adapter_type = parts[0].strip() if len(parts) > 0 else "Unknown"
            adapter_name = parts[1].strip() if len(parts) > 1 else line.strip()
            
            current_adapter = {
                "name": adapter_name,
                "type": adapter_type,
                "status": "unknown"
            }
            continue
        
        if current_adapter is None:
            continue
        
        # Parse key-value pairs
        if ':' in line or '.' in line:
            # Handle Windows ipconfig format
            if ' : ' in line:
                key, value = line.split(' : ', 1)
            elif '. :' in line:
                key, value = line.rsplit('. :', 1)
            elif ':' in line:
                parts = line.split(':', 1)
                if len(parts) == 2:
                    key, value = parts
                else:
                    continue
            else:
                continue
            
            key = key.strip().lower()
            value = value.strip()
            
            if 'ipv4' in key or 'ip address' in key:
                # Remove (Preferred) suffix if present
                current_adapter["ipv4Address"] = value.replace("(Preferred)", "").strip()
                current_adapter["status"] = "connected"
            elif 'ipv6' in key:
                current_adapter["ipv6Address"] = value.replace("(Preferred)", "").strip()
            elif 'subnet' in key:
                current_adapter["subnetMask"] = value
            elif 'gateway' in key and value:
                current_adapter["defaultGateway"] = value
            elif 'physical' in key or 'mac' in key:
                current_adapter["macAddress"] = value
            elif 'dhcp' in key and 'enabled' in key.lower():
                current_adapter["dhcpEnabled"] = value.lower() == 'yes'
            elif 'dns' in key and 'server' in key:
                if "dnsServers" not in current_adapter:
                    current_adapter["dnsServers"] = []
                if value:
                    current_adapter["dnsServers"].append(value)
            elif 'media state' in key or 'media disconnected' in value.lower():
                current_adapter["status"] = "disconnected"
    
    # Don't forget the last adapter
    if current_adapter:
        adapters.append(current_adapter)
    
    return adapters

async def ping_host(host: str, count: int = 4) -> ToolCallResponse:
    """Ping a host to check connectivity."""
    try:
        if platform.system() == "Windows":
            command = f"ping -n {count} {host}"
        else:
            command = f"ping -c {count} {host}"
        
        result = await execute_command(command, timeout=60)
        
        if not result.success:
            return ToolCallResponse(success=False, error=result.error)
        
        output = result.output or ""
        reachable = (
            "Request timed out" not in output and
            "could not find host" not in output.lower() and
            "Destination host unreachable" not in output
        )
        
        # Try to extract latency
        latency = None
        import re
        match = re.search(r'Average = (\d+)ms', output)
        if match:
            latency = int(match.group(1))
        
        return ToolCallResponse(success=True, data={
            "output": output,
            "reachable": reachable,
            "latency": latency
        })
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def get_dns_info(hostname: str) -> ToolCallResponse:
    """Get DNS resolution information for a hostname."""
    try:
        result = await execute_command(f"nslookup {hostname}")
        
        if not result.success:
            return ToolCallResponse(success=False, error=result.error)
        
        output = result.output or ""
        
        # Extract IP addresses
        import re
        addresses = []
        for match in re.finditer(r'Address:\s*([\d.]+)', output):
            addr = match.group(1)
            if not addr.startswith('127.0.0'):
                addresses.append(addr)
        
        return ToolCallResponse(success=True, data={
            "output": output,
            "addresses": addresses
        })
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def read_file(path: str, start_line: Optional[int] = None, end_line: Optional[int] = None) -> ToolCallResponse:
    """Read contents of a file."""
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        
        if start_line is not None and end_line is not None:
            # Convert to 0-based indexing
            start = max(0, start_line - 1)
            end = min(len(lines), end_line)
            lines = lines[start:end]
        
        content = ''.join(lines)
        return ToolCallResponse(success=True, data={"content": content, "lines": len(lines)})
    except FileNotFoundError:
        return ToolCallResponse(success=False, error=f"File not found: {path}")
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))


async def grep_search(directory: str, pattern: str, file_pattern: Optional[str] = None, 
                      ignore_case: bool = True, max_results: int = 50) -> ToolCallResponse:
    """Search for text pattern in files within a directory."""
    import os
    import re
    import fnmatch
    
    try:
        results = []
        files_searched = 0
        
        # Common patterns to ignore
        ignore_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'out', '.cache', 'coverage'}
        ignore_extensions = {'.pyc', '.pyo', '.exe', '.dll', '.so', '.dylib', '.bin', '.lock', '.map', '.min.js', '.min.css'}
        
        # Compile regex pattern
        flags = re.IGNORECASE if ignore_case else 0
        try:
            regex = re.compile(pattern, flags)
        except re.error as e:
            return ToolCallResponse(success=False, error=f"Invalid regex pattern: {e}")
        
        for root, dirs, files in os.walk(directory):
            # Skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for filename in files:
                # Check file pattern filter
                if file_pattern and not fnmatch.fnmatch(filename, file_pattern):
                    continue
                
                # Skip binary/ignored extensions
                _, ext = os.path.splitext(filename)
                if ext.lower() in ignore_extensions:
                    continue
                
                filepath = os.path.join(root, filename)
                rel_path = os.path.relpath(filepath, directory)
                
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        files_searched += 1
                        for line_num, line in enumerate(f, 1):
                            if regex.search(line):
                                results.append({
                                    "file": rel_path,
                                    "line": line_num,
                                    "content": line.strip()[:150]  # Limit line length more aggressively
                                })
                                
                                if len(results) >= max_results:
                                    return ToolCallResponse(success=True, data={
                                        "results": results,
                                        "totalMatches": len(results),
                                        "filesSearched": files_searched,
                                        "truncated": True,
                                        "message": f"Results limited to {max_results}. Use file_pattern to narrow search."
                                    })
                except (IOError, UnicodeDecodeError):
                    # Skip files that can't be read
                    continue
        
        return ToolCallResponse(success=True, data={
            "results": results,
            "totalMatches": len(results),
            "filesSearched": files_searched,
            "truncated": False
        })
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))


class SnapshotRequest(BaseModel):
    path: str


@app.post("/api/file/snapshot")
async def get_file_snapshot(request: SnapshotRequest):
    """Get a snapshot of a file's current content before modification.
    Returns the file content or null if file doesn't exist (for new files)."""
    import os
    try:
        path = request.path
        
        if not os.path.exists(path):
            # File doesn't exist yet - this is a new file
            return {"success": True, "exists": False, "content": None}
        
        if os.path.isdir(path):
            return {"success": False, "error": f"Path is a directory: {path}"}
        
        # Read the file content
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        
        return {"success": True, "exists": True, "content": content}
    except Exception as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def list_directory(path: str, recursive: bool = False, pattern: Optional[str] = None, max_entries: int = 200) -> ToolCallResponse:
    """List contents of a directory."""
    import os
    import fnmatch
    
    # Directories to always skip (large/irrelevant)
    skip_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', 'out', '.cache', 'coverage', '.nyc_output'}
    
    try:
        entries = []
        truncated = False
        
        if recursive:
            for root, dirs, files in os.walk(path):
                # Skip ignored directories
                dirs[:] = [d for d in dirs if d not in skip_dirs]
                
                for name in dirs + files:
                    if len(entries) >= max_entries:
                        truncated = True
                        break
                    full_path = os.path.join(root, name)
                    rel_path = os.path.relpath(full_path, path)
                    if pattern is None or fnmatch.fnmatch(name, pattern):
                        entries.append({
                            "name": rel_path,
                            "isDirectory": os.path.isdir(full_path),
                            "size": os.path.getsize(full_path) if os.path.isfile(full_path) else 0
                        })
                if truncated:
                    break
        else:
            for name in os.listdir(path):
                # Skip ignored directories at top level too
                if name in skip_dirs:
                    continue
                if len(entries) >= max_entries:
                    truncated = True
                    break
                full_path = os.path.join(path, name)
                if pattern is None or fnmatch.fnmatch(name, pattern):
                    entries.append({
                        "name": name,
                        "isDirectory": os.path.isdir(full_path),
                        "size": os.path.getsize(full_path) if os.path.isfile(full_path) else 0
                    })
        
        result = {"entries": entries, "totalCount": len(entries)}
        if truncated:
            result["truncated"] = True
            result["message"] = f"Results limited to {max_entries} entries. Use pattern filter for more specific results."
        
        return ToolCallResponse(success=True, data=result)
    except FileNotFoundError:
        return ToolCallResponse(success=False, error=f"Directory not found: {path}")
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

# System Metrics
import psutil
import os as os_module

def get_system_metrics():
    """Get current system CPU and memory usage metrics."""
    try:
        # Get current process info
        process = psutil.Process(os_module.getpid())
        
        # Process-specific metrics
        process_cpu = process.cpu_percent(interval=0.1)
        process_memory = process.memory_info()
        process_memory_mb = process_memory.rss / (1024 * 1024)
        process_memory_percent = process.memory_percent()
        
        # System-wide metrics
        system_cpu = psutil.cpu_percent(interval=0.1)
        system_memory = psutil.virtual_memory()
        system_memory_total_gb = system_memory.total / (1024 * 1024 * 1024)
        system_memory_used_gb = system_memory.used / (1024 * 1024 * 1024)
        system_memory_percent = system_memory.percent
        
        # CPU core info
        cpu_count = psutil.cpu_count()
        cpu_count_logical = psutil.cpu_count(logical=True)
        
        return {
            "success": True,
            "process": {
                "cpuPercent": round(process_cpu, 1),
                "memoryMb": round(process_memory_mb, 1),
                "memoryPercent": round(process_memory_percent, 1),
                "pid": process.pid
            },
            "system": {
                "cpuPercent": round(system_cpu, 1),
                "cpuCores": cpu_count,
                "cpuLogicalCores": cpu_count_logical,
                "memoryTotalGb": round(system_memory_total_gb, 2),
                "memoryUsedGb": round(system_memory_used_gb, 2),
                "memoryPercent": round(system_memory_percent, 1)
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# API Endpoints
@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "MCP Backend Server"}

class BrowseFolderRequest(BaseModel):
    path: Optional[str] = None  # Starting path, defaults to home directory

@app.post("/api/browse-folders")
async def browse_folders(request: BrowseFolderRequest):
    """
    Browse folders on the file system.
    Returns a list of folders at the given path, or drives on Windows.
    """
    import os
    import string
    
    try:
        path = request.path
        
        # If no path provided or empty, return drives (Windows) or root (Unix)
        if not path or path == "":
            if platform.system() == "Windows":
                # Get available drives
                drives = []
                for letter in string.ascii_uppercase:
                    drive = f"{letter}:\\"
                    if os.path.exists(drive):
                        drives.append({
                            "name": f"{letter}:",
                            "path": drive,
                            "type": "drive"
                        })
                return {"success": True, "path": "", "folders": drives, "canGoUp": False}
            else:
                path = "/"
        
        # Normalize path
        path = os.path.normpath(path)
        
        if not os.path.exists(path):
            return {"success": False, "error": f"Path does not exist: {path}", "folders": []}
        
        if not os.path.isdir(path):
            return {"success": False, "error": f"Not a directory: {path}", "folders": []}
        
        # Get parent path for navigation
        parent_path = os.path.dirname(path)
        can_go_up = parent_path != path and parent_path != ""
        
        # List subdirectories
        folders = []
        try:
            for item in sorted(os.listdir(path)):
                item_path = os.path.join(path, item)
                try:
                    if os.path.isdir(item_path):
                        folders.append({
                            "name": item,
                            "path": item_path,
                            "type": "folder"
                        })
                except (PermissionError, OSError):
                    # Skip folders we can't access
                    continue
        except PermissionError:
            return {"success": False, "error": "Permission denied", "folders": []}
        
        return {
            "success": True, 
            "path": path, 
            "parentPath": parent_path if can_go_up else None,
            "folders": folders, 
            "canGoUp": can_go_up
        }
    
    except Exception as e:
        return {"success": False, "error": str(e), "folders": []}

@app.get("/api/system/metrics")
async def system_metrics():
    """Get system CPU and memory usage metrics."""
    return get_system_metrics()

@app.post("/api/system/execute")
async def execute_system_command(request: CommandRequest) -> CommandResponse:
    """Execute a system command."""
    return await execute_command(request.command)

# File Write Models
class FileWriteRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"
    createDirectories: bool = True

class FileAppendRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"

class FileDeleteRequest(BaseModel):
    path: str

class FileCopyRequest(BaseModel):
    sourcePath: str
    destinationPath: str
    overwrite: bool = False

class FileMoveRequest(BaseModel):
    sourcePath: str
    destinationPath: str
    overwrite: bool = False

class DirectoryCreateRequest(BaseModel):
    path: str
    recursive: bool = True

class FileReplaceRequest(BaseModel):
    path: str
    searchPattern: str
    replacement: str
    isRegex: bool = False
    replaceAll: bool = True

class FileInsertRequest(BaseModel):
    path: str
    lineNumber: int
    content: str

class FileReadRequest(BaseModel):
    path: str
    encoding: str = "utf-8"

# Directory Listing Endpoint - for discovering instruction files
@app.get("/api/files/{directory:path}")
async def list_directory_files(directory: str):
    """
    List files in a directory relative to the project root.
    Used for discovering instruction files in plan/, review/, etc.
    """
    import os
    
    try:
        # Get the project root (parent of backend folder)
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Build the full path
        full_path = os.path.join(project_root, directory)
        
        # Security: ensure we're still within project root
        abs_project = os.path.abspath(project_root)
        abs_target = os.path.abspath(full_path)
        
        if not abs_target.startswith(abs_project):
            return {"success": False, "error": "Access denied: path outside project", "files": []}
        
        if not os.path.exists(full_path):
            return {"success": False, "error": f"Directory not found: {directory}", "files": []}
        
        if not os.path.isdir(full_path):
            return {"success": False, "error": f"Not a directory: {directory}", "files": []}
        
        # List all files in the directory
        files = []
        for item in os.listdir(full_path):
            item_path = os.path.join(full_path, item)
            if os.path.isfile(item_path):
                files.append(item)
        
        return {"success": True, "directory": directory, "files": files}
    
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}

# Instruction Files Endpoint - aggregates files from multiple directories
INSTRUCTION_DIRECTORIES = {
    'planning': ['plan', 'summarize', 'select', 'distribute', 'work', 'continue', 'backlog', 'approval'],
    'review': ['review']
}

@app.get("/api/instruction-files/{file_type}")
async def list_instruction_files(file_type: str):
    """
    List all instruction files for a given type (planning or review).
    Aggregates .md files from all relevant directories.
    """
    import os
    
    if file_type not in INSTRUCTION_DIRECTORIES:
        return {"success": False, "error": f"Unknown file type: {file_type}. Use 'planning' or 'review'.", "files": []}
    
    try:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        directories = INSTRUCTION_DIRECTORIES[file_type]
        files = []
        
        for dir_name in directories:
            full_path = os.path.join(project_root, dir_name)
            
            if not os.path.exists(full_path) or not os.path.isdir(full_path):
                continue
            
            for item in os.listdir(full_path):
                if item.endswith('.md'):
                    item_path = os.path.join(full_path, item)
                    if os.path.isfile(item_path):
                        # Format name: remove .md, replace dashes with spaces, title case
                        name = item.replace('.md', '').replace('-', ' ').title()
                        files.append({
                            "path": f"{dir_name}/{item}",
                            "name": name,
                            "category": dir_name
                        })
        
        return {"success": True, "type": file_type, "files": files}
    
    except Exception as e:
        return {"success": False, "error": str(e), "files": []}

# File Read Endpoint
@app.post("/api/file/read")
async def read_file_endpoint(request: FileReadRequest):
    """Read content from a file."""
    import os
    try:
        path = request.path
        
        if not os.path.exists(path):
            return {"success": False, "error": f"File not found: {path}"}
        
        with open(path, 'r', encoding=request.encoding) as f:
            content = f.read()
        
        return {"success": True, "path": path, "content": content}
    except Exception as e:
        return {"success": False, "error": str(e)}

# File Write Endpoints
@app.post("/api/file/write")
async def write_file_endpoint(request: FileWriteRequest):
    """Write content to a file."""
    import os
    try:
        path = request.path
        
        # Create parent directories if needed
        if request.createDirectories:
            parent_dir = os.path.dirname(path)
            if parent_dir and not os.path.exists(parent_dir):
                os.makedirs(parent_dir, exist_ok=True)
        
        # Write the file
        with open(path, 'w', encoding=request.encoding) as f:
            f.write(request.content)
        
        return {"success": True, "path": path, "bytesWritten": len(request.content.encode(request.encoding))}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/file/append")
async def append_file_endpoint(request: FileAppendRequest):
    """Append content to a file."""
    try:
        path = request.path
        
        with open(path, 'a', encoding=request.encoding) as f:
            f.write(request.content)
        
        return {"success": True, "path": path, "bytesAppended": len(request.content.encode(request.encoding))}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/file/delete")
async def delete_file_endpoint(request: FileDeleteRequest):
    """Delete a file."""
    import os
    try:
        path = request.path
        
        if os.path.exists(path):
            os.remove(path)
            return {"success": True, "path": path}
        else:
            return {"success": False, "error": f"File not found: {path}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/file/copy")
async def copy_file_endpoint(request: FileCopyRequest):
    """Copy a file."""
    import os
    import shutil
    try:
        source = request.sourcePath
        dest = request.destinationPath
        
        if not os.path.exists(source):
            return {"success": False, "error": f"Source file not found: {source}"}
        
        if os.path.exists(dest) and not request.overwrite:
            return {"success": False, "error": f"Destination file already exists: {dest}"}
        
        # Create destination directory if needed
        dest_dir = os.path.dirname(dest)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
        
        shutil.copy2(source, dest)
        return {"success": True, "sourcePath": source, "destinationPath": dest}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/file/move")
async def move_file_endpoint(request: FileMoveRequest):
    """Move/rename a file."""
    import os
    import shutil
    try:
        source = request.sourcePath
        dest = request.destinationPath
        
        if not os.path.exists(source):
            return {"success": False, "error": f"Source file not found: {source}"}
        
        if os.path.exists(dest) and not request.overwrite:
            return {"success": False, "error": f"Destination file already exists: {dest}"}
        
        # Create destination directory if needed
        dest_dir = os.path.dirname(dest)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
        
        shutil.move(source, dest)
        return {"success": True, "sourcePath": source, "destinationPath": dest}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/directory/create")
async def create_directory_endpoint(request: DirectoryCreateRequest):
    """Create a directory."""
    import os
    try:
        path = request.path
        
        if request.recursive:
            os.makedirs(path, exist_ok=True)
        else:
            os.mkdir(path)
        
        return {"success": True, "path": path}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/file/replace")
async def replace_in_file_endpoint(request: FileReplaceRequest):
    """Replace text in a file."""
    import re
    try:
        path = request.path
        
        # Read the file
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Perform replacement
        if request.isRegex:
            if request.replaceAll:
                new_content = re.sub(request.searchPattern, request.replacement, content)
            else:
                new_content = re.sub(request.searchPattern, request.replacement, content, count=1)
        else:
            if request.replaceAll:
                new_content = content.replace(request.searchPattern, request.replacement)
            else:
                new_content = content.replace(request.searchPattern, request.replacement, 1)
        
        # Write back
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return {"success": True, "path": path}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/file/insert")
async def insert_at_line_endpoint(request: FileInsertRequest):
    """Insert content at a specific line."""
    try:
        path = request.path
        
        # Read the file
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Insert the content
        line_idx = request.lineNumber - 1  # Convert to 0-indexed
        if line_idx < 0:
            line_idx = 0
        elif line_idx > len(lines):
            line_idx = len(lines)
        
        # Ensure content ends with newline if inserting in middle
        content = request.content
        if line_idx < len(lines) and not content.endswith('\n'):
            content += '\n'
        
        lines.insert(line_idx, content)
        
        # Write back
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        
        return {"success": True, "path": path}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/mcp/call")
async def call_mcp_tool(request: ToolCallRequest) -> ToolCallResponse:
    """Call an MCP tool by name."""
    tool = request.tool
    input_data = request.input
    
    # List of tools that access the filesystem
    path_based_tools = [
        'read_file', 'write_file', 'append_file', 'delete_file',
        'list_directory', 'create_directory', 'move_file', 'copy_file',
        'search_files', 'search_in_file', 'replace_in_file', 'insert_at_line',
        'file_exists', 'get_file_info'
    ]
    
    # Validate path access for path-based tools
    if tool in path_based_tools and request.allowedPath and not request.allowExternal:
        path_fields = ['path', 'sourcePath', 'destinationPath', 'directory']
        
        for field in path_fields:
            if field in input_data and isinstance(input_data[field], str):
                allowed, reason = validate_path_access(
                    input_data[field],
                    request.allowedPath,
                    request.allowExternal
                )
                if not allowed:
                    return ToolCallResponse(
                        success=False,
                        error=f"Access denied: {reason}",
                        sandboxViolation=True
                    )
    
    # Route to appropriate handler
    handlers = {
        "get_hostname": lambda: get_hostname(),
        "get_ipconfig": lambda: get_ipconfig(
            adapter=input_data.get("adapter"),
            include_raw=input_data.get("includeRaw", False)
        ),
        "get_host_details": lambda: get_host_details(
            include_disconnected=input_data.get("includeDisconnected", True)
        ),
        "ping_host": lambda: ping_host(
            host=input_data.get("host", "localhost"),
            count=input_data.get("count", 4)
        ),
        "get_dns_info": lambda: get_dns_info(
            hostname=input_data.get("hostname", "localhost")
        ),
        "read_file": lambda: read_file(
            path=input_data.get("path", ""),
            start_line=input_data.get("startLine"),
            end_line=input_data.get("endLine")
        ),
        "list_directory": lambda: list_directory(
            path=input_data.get("path", "."),
            recursive=input_data.get("recursive", False),
            pattern=input_data.get("pattern")
        ),
        "grep_search": lambda: grep_search(
            directory=input_data.get("directory", "."),
            pattern=input_data.get("pattern", ""),
            file_pattern=input_data.get("filePattern"),
            ignore_case=input_data.get("ignoreCase", True),
            max_results=input_data.get("maxResults", 100)
        ),
        "write_file": lambda: write_file_tool(
            path=input_data.get("path", ""),
            content=input_data.get("content", ""),
            encoding=input_data.get("encoding", "utf-8"),
            create_directories=input_data.get("createDirectories", True)
        ),
        "append_file": lambda: append_file_tool(
            path=input_data.get("path", ""),
            content=input_data.get("content", ""),
            encoding=input_data.get("encoding", "utf-8")
        ),
        "delete_file": lambda: delete_file_tool(
            path=input_data.get("path", "")
        ),
        "copy_file": lambda: copy_file_tool(
            source_path=input_data.get("sourcePath", ""),
            destination_path=input_data.get("destinationPath", ""),
            overwrite=input_data.get("overwrite", False)
        ),
        "move_file": lambda: move_file_tool(
            source_path=input_data.get("sourcePath", ""),
            destination_path=input_data.get("destinationPath", ""),
            overwrite=input_data.get("overwrite", False)
        ),
        "create_directory": lambda: create_directory_tool(
            path=input_data.get("path", ""),
            recursive=input_data.get("recursive", True)
        ),
        "replace_in_file": lambda: replace_in_file_tool(
            path=input_data.get("path", ""),
            search_pattern=input_data.get("searchPattern", ""),
            replacement=input_data.get("replacement", ""),
            is_regex=input_data.get("isRegex", False),
            replace_all=input_data.get("replaceAll", True)
        ),
        "insert_at_line": lambda: insert_at_line_tool(
            path=input_data.get("path", ""),
            line_number=input_data.get("lineNumber", 1),
            content=input_data.get("content", "")
        ),
    }
    
    if tool not in handlers:
        return ToolCallResponse(success=False, error=f"Unknown tool: {tool}")
    
    return await handlers[tool]()

# File write tool functions for MCP call endpoint
async def write_file_tool(path: str, content: str, encoding: str = "utf-8", create_directories: bool = True) -> ToolCallResponse:
    """Write content to a file."""
    import os
    try:
        if create_directories:
            parent_dir = os.path.dirname(path)
            if parent_dir and not os.path.exists(parent_dir):
                os.makedirs(parent_dir, exist_ok=True)
        
        with open(path, 'w', encoding=encoding) as f:
            f.write(content)
        
        return ToolCallResponse(success=True, data={"path": path, "bytesWritten": len(content.encode(encoding))})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def append_file_tool(path: str, content: str, encoding: str = "utf-8") -> ToolCallResponse:
    """Append content to a file."""
    try:
        with open(path, 'a', encoding=encoding) as f:
            f.write(content)
        
        return ToolCallResponse(success=True, data={"path": path, "bytesAppended": len(content.encode(encoding))})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def delete_file_tool(path: str) -> ToolCallResponse:
    """Delete a file."""
    import os
    try:
        if os.path.exists(path):
            os.remove(path)
            return ToolCallResponse(success=True, data={"path": path})
        else:
            return ToolCallResponse(success=False, error=f"File not found: {path}")
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def copy_file_tool(source_path: str, destination_path: str, overwrite: bool = False) -> ToolCallResponse:
    """Copy a file."""
    import os
    import shutil
    try:
        if not os.path.exists(source_path):
            return ToolCallResponse(success=False, error=f"Source file not found: {source_path}")
        
        if os.path.exists(destination_path) and not overwrite:
            return ToolCallResponse(success=False, error=f"Destination file already exists: {destination_path}")
        
        dest_dir = os.path.dirname(destination_path)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
        
        shutil.copy2(source_path, destination_path)
        return ToolCallResponse(success=True, data={"sourcePath": source_path, "destinationPath": destination_path})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def move_file_tool(source_path: str, destination_path: str, overwrite: bool = False) -> ToolCallResponse:
    """Move/rename a file."""
    import os
    import shutil
    try:
        if not os.path.exists(source_path):
            return ToolCallResponse(success=False, error=f"Source file not found: {source_path}")
        
        if os.path.exists(destination_path) and not overwrite:
            return ToolCallResponse(success=False, error=f"Destination file already exists: {destination_path}")
        
        dest_dir = os.path.dirname(destination_path)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)
        
        shutil.move(source_path, destination_path)
        return ToolCallResponse(success=True, data={"sourcePath": source_path, "destinationPath": destination_path})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def create_directory_tool(path: str, recursive: bool = True) -> ToolCallResponse:
    """Create a directory."""
    import os
    try:
        if recursive:
            os.makedirs(path, exist_ok=True)
        else:
            os.mkdir(path)
        
        return ToolCallResponse(success=True, data={"path": path})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def replace_in_file_tool(path: str, search_pattern: str, replacement: str, is_regex: bool = False, replace_all: bool = True) -> ToolCallResponse:
    """Replace text in a file."""
    import re
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if is_regex:
            if replace_all:
                new_content = re.sub(search_pattern, replacement, content)
            else:
                new_content = re.sub(search_pattern, replacement, content, count=1)
        else:
            if replace_all:
                new_content = content.replace(search_pattern, replacement)
            else:
                new_content = content.replace(search_pattern, replacement, 1)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        return ToolCallResponse(success=True, data={"path": path})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def insert_at_line_tool(path: str, line_number: int, content: str) -> ToolCallResponse:
    """Insert content at a specific line."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        line_idx = line_number - 1
        if line_idx < 0:
            line_idx = 0
        elif line_idx > len(lines):
            line_idx = len(lines)
        
        insert_content = content
        if line_idx < len(lines) and not content.endswith('\n'):
            insert_content += '\n'
        
        lines.insert(line_idx, insert_content)
        
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        
        return ToolCallResponse(success=True, data={"path": path})
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))

async def get_host_details(include_disconnected: bool = True) -> ToolCallResponse:
    """Get comprehensive host details."""
    hostname_result = await get_hostname()
    ipconfig_result = await get_ipconfig()
    
    if not hostname_result.success:
        return hostname_result
    
    adapters = ipconfig_result.data.get("adapters", []) if ipconfig_result.data else []
    
    if not include_disconnected:
        adapters = [a for a in adapters if a.get("status") == "connected"]
    
    return ToolCallResponse(success=True, data={
        "hostname": hostname_result.data.get("hostname") if hostname_result.data else None,
        "adapters": adapters
    })

@app.get("/api/mcp/tools")
async def list_tools():
    """List all available MCP tools."""
    tools = [
        {
            "name": "get_hostname",
            "description": "Get the hostname of the current machine",
            "inputSchema": {"type": "object", "properties": {}, "required": []}
        },
        {
            "name": "get_ipconfig",
            "description": "Get network configuration details (ipconfig /all equivalent)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "adapter": {"type": "string", "description": "Optional: Filter by adapter name"},
                    "includeRaw": {"type": "boolean", "description": "Include raw output", "default": False}
                },
                "required": []
            }
        },
        {
            "name": "get_host_details",
            "description": "Get comprehensive host details including hostname and network adapters",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "includeDisconnected": {"type": "boolean", "default": True}
                },
                "required": []
            }
        },
        {
            "name": "ping_host",
            "description": "Ping a host to check connectivity",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "host": {"type": "string", "description": "Hostname or IP to ping"},
                    "count": {"type": "integer", "default": 4}
                },
                "required": ["host"]
            }
        },
        {
            "name": "get_dns_info",
            "description": "Get DNS resolution information for a hostname",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "hostname": {"type": "string", "description": "Hostname to resolve"}
                },
                "required": ["hostname"]
            }
        },
        {
            "name": "read_file",
            "description": "Read contents of a file",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "startLine": {"type": "integer", "description": "Start line (1-based)"},
                    "endLine": {"type": "integer", "description": "End line (1-based)"}
                },
                "required": ["path"]
            }
        },
        {
            "name": "list_directory",
            "description": "List contents of a directory. Automatically skips node_modules, .git, etc. Limited to 200 entries.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to directory"},
                    "recursive": {"type": "boolean", "default": False, "description": "If true, list recursively (limited)"},
                    "pattern": {"type": "string", "description": "Glob pattern to filter (e.g., '*.tsx')"}
                },
                "required": ["path"]
            }
        },
        {
            "name": "grep_search",
            "description": "Search for text/regex pattern in files. Skips node_modules, .git, etc. Limited to 50 results.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "directory": {"type": "string", "description": "Root directory to search in"},
                    "pattern": {"type": "string", "description": "Text or regex pattern to search for"},
                    "filePattern": {"type": "string", "description": "Glob pattern to filter files (e.g., '*.tsx')"},
                    "ignoreCase": {"type": "boolean", "default": True}
                },
                "required": ["directory", "pattern"]
            }
        },
        {
            "name": "write_file",
            "description": "Write content to a file. Creates the file if it does not exist, overwrites if it does.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "content": {"type": "string", "description": "Content to write"},
                    "encoding": {"type": "string", "default": "utf-8"},
                    "createDirectories": {"type": "boolean", "default": True}
                },
                "required": ["path", "content"]
            }
        },
        {
            "name": "append_file",
            "description": "Append content to the end of a file",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "content": {"type": "string", "description": "Content to append"},
                    "encoding": {"type": "string", "default": "utf-8"}
                },
                "required": ["path", "content"]
            }
        },
        {
            "name": "delete_file",
            "description": "Delete a file",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"}
                },
                "required": ["path"]
            }
        },
        {
            "name": "copy_file",
            "description": "Copy a file from source to destination",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sourcePath": {"type": "string", "description": "Source file path"},
                    "destinationPath": {"type": "string", "description": "Destination file path"},
                    "overwrite": {"type": "boolean", "default": False}
                },
                "required": ["sourcePath", "destinationPath"]
            }
        },
        {
            "name": "move_file",
            "description": "Move/rename a file",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sourcePath": {"type": "string", "description": "Source file path"},
                    "destinationPath": {"type": "string", "description": "Destination file path"},
                    "overwrite": {"type": "boolean", "default": False}
                },
                "required": ["sourcePath", "destinationPath"]
            }
        },
        {
            "name": "create_directory",
            "description": "Create a directory",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to directory"},
                    "recursive": {"type": "boolean", "default": True}
                },
                "required": ["path"]
            }
        },
        {
            "name": "replace_in_file",
            "description": "Replace text in a file using string or regex pattern",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "searchPattern": {"type": "string", "description": "Text or regex to search for"},
                    "replacement": {"type": "string", "description": "Replacement text"},
                    "isRegex": {"type": "boolean", "default": False},
                    "replaceAll": {"type": "boolean", "default": True}
                },
                "required": ["path", "searchPattern", "replacement"]
            }
        },
        {
            "name": "insert_at_line",
            "description": "Insert content at a specific line number",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file"},
                    "lineNumber": {"type": "integer", "description": "Line number (1-based)"},
                    "content": {"type": "string", "description": "Content to insert"}
                },
                "required": ["path", "lineNumber", "content"]
            }
        }
    ]
    return {"tools": tools}

if __name__ == "__main__":
    import uvicorn
    print("Starting MCP Backend Server on http://localhost:8765")
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
