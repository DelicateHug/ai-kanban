/**
 * Path Sandbox Utilities - Validates and restricts path access based on project settings
 * Ensures MCP tools respect project boundaries unless external access is explicitly allowed
 * 
 * Access Rules:
 * 1. Relative paths without ".." are always allowed (they resolve within the app's working directory)
 * 2. Absolute paths or paths with ".." are checked against the project folder
 * 3. Project folder has full read/write access
 * 4. External paths require "Allow External Access" to be enabled
 */

import { useProjectStore, getProjectPath } from './ProjectStore';
import { useTaskStore } from './TaskStore';
import type { Task } from './types';

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  projectPath?: string;
  readOnly?: boolean; // True if access is allowed but only for reading (app working dir)
}

/**
 * Check if a path is a simple relative path (doesn't escape with ..)
 * Simple relative paths are within the MCP working directory and are always allowed
 */
export function isSimpleRelativePath(path: string): boolean {
  // Normalize to forward slashes
  const normalized = path.replace(/\\/g, '/');
  
  // Check if it's an absolute path (starts with / or drive letter)
  if (normalized.match(/^[a-zA-Z]:|^\//)) {
    return false;
  }
  
  // Check if it contains .. which could escape the directory
  if (normalized.includes('..')) {
    return false;
  }
  
  // It's a simple relative path like "work/implementation.md" or "./config.json"
  return true;
}

/**
 * Normalize a path for comparison (handle Windows/Unix differences)
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

/**
 * Check if a target path is within a folder
 */
export function isPathWithinFolder(targetPath: string, folderPath: string): boolean {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedFolder = normalizePath(folderPath);
  
  // Ensure folder path ends with /
  const folderWithSlash = normalizedFolder.endsWith('/') 
    ? normalizedFolder 
    : normalizedFolder + '/';
  
  return normalizedTarget.startsWith(folderWithSlash) || 
         normalizePath(targetPath) === normalizePath(folderPath);
}

/**
 * Resolve a relative path to an absolute path within the project
 */
export function resolveProjectPath(relativePath: string, projectPath: string): string {
  // If already absolute, return as-is
  if (relativePath.match(/^[a-zA-Z]:|^\//)) {
    return relativePath;
  }
  
  // Join with project path
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/$/, '');
  const cleanRelative = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  
  return `${normalized}/${cleanRelative}`;
}

/**
 * Validate if a path access is allowed for a given task
 */
export function validatePathForTask(targetPath: string, taskId: string): PathValidationResult {
  const task = useTaskStore.getState().getTask(taskId);
  
  if (!task) {
    return { 
      allowed: false, 
      reason: 'Task not found' 
    };
  }
  
  return validatePathForTaskData(targetPath, task);
}

/**
 * Validate if a path access is allowed for a task (using task data directly)
 * 
 * Access rules:
 * 1. Simple relative paths (no ".." or absolute) are always allowed - they're within the app's working dir
 * 2. Project folder paths have full access
 * 3. Other paths require "Allow External Access"
 */
export function validatePathForTaskData(targetPath: string, task: Task): PathValidationResult {
  // Simple relative paths (like "work/implementation.md") are always allowed
  // These resolve within the MCP server's working directory (the ai-jira app folder)
  // and contain stage instructions needed for all tasks
  if (isSimpleRelativePath(targetPath)) {
    return { allowed: true };
  }
  
  // If no project is assigned, allow all access for absolute/escape paths too
  if (!task.projectId) {
    return { allowed: true };
  }
  
  // If external access is allowed, permit everything
  if (task.allowExternalAccess) {
    return { allowed: true };
  }
  
  // Get the project path
  const projectPath = getProjectPath(task.projectId);
  
  if (!projectPath) {
    return { 
      allowed: false, 
      reason: 'Project not found' 
    };
  }
  
  // For absolute paths or paths with "..", check if they're within the project folder
  // Resolve relative paths that contain ".." to absolute paths based on project folder
  const resolvedPath = resolveProjectPath(targetPath, projectPath);
  
  // Check if the resolved path is within the project folder
  const isWithin = isPathWithinFolder(resolvedPath, projectPath);
  
  if (isWithin) {
    return { 
      allowed: true, 
      projectPath 
    };
  }
  
  return {
    allowed: false,
    reason: `Path "${targetPath}" is outside project folder "${projectPath}". Enable "Allow External Access" to access files outside the project.`,
    projectPath
  };
}

/**
 * Get allowed paths info for a task (for display purposes)
 */
export function getTaskPathRestrictions(taskId: string): {
  hasProject: boolean;
  projectName?: string;
  projectPath?: string;
  allowsExternal: boolean;
} {
  const task = useTaskStore.getState().getTask(taskId);
  
  if (!task) {
    return { hasProject: false, allowsExternal: true };
  }
  
  if (!task.projectId) {
    return { hasProject: false, allowsExternal: true };
  }
  
  const project = useProjectStore.getState().getProject(task.projectId);
  
  if (!project) {
    return { hasProject: false, allowsExternal: true };
  }
  
  return {
    hasProject: true,
    projectName: project.name,
    projectPath: project.path,
    allowsExternal: task.allowExternalAccess
  };
}

/**
 * Create a sandbox wrapper for MCP tool execution
 * This wraps a tool execution function to validate paths before allowing access
 */
export function createSandboxedToolExecutor(
  taskId: string,
  executor: (toolName: string, input: Record<string, unknown>) => Promise<unknown>
): (toolName: string, input: Record<string, unknown>) => Promise<unknown> {
  return async (toolName: string, input: Record<string, unknown>) => {
    // List of tools that access the filesystem
    const pathBasedTools = [
      'read_file', 'write_file', 'append_file', 'delete_file',
      'list_directory', 'create_directory', 'move_file', 'copy_file',
      'search_files', 'search_in_file'
    ];
    
    // Check if this tool accesses paths
    if (pathBasedTools.includes(toolName)) {
      const pathFields = ['path', 'sourcePath', 'destinationPath', 'directory'];
      
      for (const field of pathFields) {
        if (field in input && typeof input[field] === 'string') {
          const validation = validatePathForTask(input[field], taskId);
          
          if (!validation.allowed) {
            return {
              success: false,
              error: `Access denied: ${validation.reason}`,
              sandboxViolation: true
            };
          }
        }
      }
    }
    
    // Execute the actual tool
    return executor(toolName, input);
  };
}

/**
 * Validate multiple paths at once
 */
export function validatePathsForTask(paths: string[], taskId: string): PathValidationResult {
  for (const path of paths) {
    const result = validatePathForTask(path, taskId);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true };
}
