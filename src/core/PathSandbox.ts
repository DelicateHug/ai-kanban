/**
 * Path Sandbox Utilities - Validates and restricts path access based on project settings
 * Ensures MCP tools respect project boundaries unless external access is explicitly allowed
 */

import { useProjectStore, getProjectPath } from './ProjectStore';
import { useTaskStore } from './TaskStore';
import type { Task } from './types';

export interface PathValidationResult {
  allowed: boolean;
  reason?: string;
  projectPath?: string;
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
 */
export function validatePathForTaskData(targetPath: string, task: Task): PathValidationResult {
  // If no project is assigned, allow all access
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
  
  // Check if the target path is within the project folder
  const isWithin = isPathWithinFolder(targetPath, projectPath);
  
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
