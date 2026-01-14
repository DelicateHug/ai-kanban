/**
 * Project Store - Manages project state and sandboxing
 * Projects are folders that restrict MCP tool access to their contents
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Project } from './types';

// Default project colors
export const PROJECT_COLORS = [
  '#4ade80', // green
  '#60a5fa', // blue
  '#f472b6', // pink
  '#facc15', // yellow
  '#c084fc', // purple
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#f87171', // red
  '#a3e635', // lime
  '#e879f9', // fuchsia
];

// Default project icons
export const PROJECT_ICONS = [
  '📁', '🚀', '💻', '🎨', '📱', '🔧', '📊', '🎮', '🌐', '⚡',
  '🔬', '📈', '🛠️', '🎯', '💡', '🔒', '📝', '🏗️', '🎪', '🌟'
];

interface ProjectStore {
  // State
  projects: Map<string, Project>;
  activeProjectId: string | null; // null means "All Projects" view

  // Actions
  createProject: (name: string, path: string, description?: string, color?: string, icon?: string) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  setActiveProject: (projectId: string | null) => void;

  // Selectors
  getProject: (projectId: string) => Project | undefined;
  getAllProjects: () => Project[];
  getActiveProject: () => Project | null;
  
  // Path validation
  isPathInProject: (path: string, projectId: string) => boolean;
  validatePathAccess: (path: string, projectId: string | undefined, allowExternal: boolean) => boolean;
  
  // Stats
  updateProjectStats: (projectId: string, taskCount: number, activeTaskCount: number) => void;
}

// Normalize paths for comparison (handle Windows/Unix differences)
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

// Check if a path is within a project folder
function isPathWithinFolder(targetPath: string, folderPath: string): boolean {
  const normalizedTarget = normalizePath(targetPath);
  const normalizedFolder = normalizePath(folderPath);
  
  // Ensure folder path ends with /
  const folderWithSlash = normalizedFolder.endsWith('/') 
    ? normalizedFolder 
    : normalizedFolder + '/';
  
  return normalizedTarget.startsWith(folderWithSlash) || normalizedTarget === normalizedFolder;
}

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set, get) => ({
    projects: new Map(),
    activeProjectId: null,

    createProject: (name: string, path: string, description?: string, color?: string, icon?: string): Project => {
      const id = uuidv4();
      const now = new Date().toISOString();
      
      // Pick a random color if not provided
      const projectColor = color || PROJECT_COLORS[get().projects.size % PROJECT_COLORS.length];
      const projectIcon = icon || PROJECT_ICONS[get().projects.size % PROJECT_ICONS.length];
      
      const project: Project = {
        id,
        name,
        description: description || '',
        path: path.replace(/\\/g, '/'), // Normalize to forward slashes
        color: projectColor,
        icon: projectIcon,
        createdAt: now,
        updatedAt: now,
        taskCount: 0,
        activeTaskCount: 0,
      };

      set((state) => {
        const newProjects = new Map(state.projects);
        newProjects.set(id, project);
        return { projects: newProjects };
      });

      return project;
    },

    updateProject: (projectId: string, updates: Partial<Project>): void => {
      set((state) => {
        const project = state.projects.get(projectId);
        if (!project) return state;

        const updatedProject: Project = {
          ...project,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const newProjects = new Map(state.projects);
        newProjects.set(projectId, updatedProject);

        return { projects: newProjects };
      });
    },

    deleteProject: (projectId: string): void => {
      set((state) => {
        const newProjects = new Map(state.projects);
        newProjects.delete(projectId);

        // If deleting active project, switch to all projects view
        const newActiveId = state.activeProjectId === projectId ? null : state.activeProjectId;

        return { projects: newProjects, activeProjectId: newActiveId };
      });
    },

    setActiveProject: (projectId: string | null): void => {
      set({ activeProjectId: projectId });
    },

    getProject: (projectId: string): Project | undefined => {
      return get().projects.get(projectId);
    },

    getAllProjects: (): Project[] => {
      return Array.from(get().projects.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
    },

    getActiveProject: (): Project | null => {
      const { activeProjectId, projects } = get();
      if (!activeProjectId) return null;
      return projects.get(activeProjectId) || null;
    },

    isPathInProject: (path: string, projectId: string): boolean => {
      const project = get().projects.get(projectId);
      if (!project) return false;
      return isPathWithinFolder(path, project.path);
    },

    validatePathAccess: (path: string, projectId: string | undefined, allowExternal: boolean): boolean => {
      // If no project is specified, always allow access
      if (!projectId) return true;
      
      // If external access is allowed, always permit
      if (allowExternal) return true;
      
      // Check if path is within project
      return get().isPathInProject(path, projectId);
    },

    updateProjectStats: (projectId: string, taskCount: number, activeTaskCount: number): void => {
      set((state) => {
        const project = state.projects.get(projectId);
        if (!project) return state;

        const updatedProject: Project = {
          ...project,
          taskCount,
          activeTaskCount,
        };

        const newProjects = new Map(state.projects);
        newProjects.set(projectId, updatedProject);

        return { projects: newProjects };
      });
    },
  }))
);

// Export helper functions for path validation
export function isPathInProject(path: string, projectId: string): boolean {
  return useProjectStore.getState().isPathInProject(path, projectId);
}

export function validatePathAccess(path: string, projectId: string | undefined, allowExternal: boolean): boolean {
  return useProjectStore.getState().validatePathAccess(path, projectId, allowExternal);
}

export function getProjectPath(projectId: string): string | null {
  const project = useProjectStore.getState().getProject(projectId);
  return project?.path || null;
}

// Storage functions for persistence
const STORAGE_KEY = 'ai-kanban-projects';

export function saveProjectsToStorage(): void {
  const { projects, activeProjectId } = useProjectStore.getState();
  const projectsArray = Array.from(projects.values());
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projects: projectsArray,
      activeProjectId,
    }));
  } catch (error) {
    console.error('Failed to save projects to storage:', error);
  }
}

export function loadProjectsFromStorage(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;

    const data = JSON.parse(stored);
    const projectsMap = new Map<string, Project>();
    
    if (Array.isArray(data.projects)) {
      for (const project of data.projects) {
        projectsMap.set(project.id, project);
      }
    }

    useProjectStore.setState({
      projects: projectsMap,
      activeProjectId: data.activeProjectId || null,
    });

    return true;
  } catch (error) {
    console.error('Failed to load projects from storage:', error);
    return false;
  }
}

// Save projects to file via backend
export async function saveProjectsToFile(filePath: string = 'data/projects.json'): Promise<boolean> {
  const { projects, activeProjectId } = useProjectStore.getState();
  const projectsArray = Array.from(projects.values());
  
  // Also save to localStorage as backup
  saveProjectsToStorage();
  
  try {
    const response = await fetch('http://localhost:8765/api/file/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: filePath,
        content: JSON.stringify({ projects: projectsArray, activeProjectId, savedAt: new Date().toISOString() }, null, 2),
        encoding: 'utf-8',
        createDirectories: true
      }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`Projects saved to ${filePath}`);
      return true;
    } else {
      console.error('Failed to save projects to file:', result.error);
      return true; // localStorage succeeded
    }
  } catch (error) {
    console.error('Failed to save projects to file (localStorage fallback used):', error);
    return true; // localStorage succeeded
  }
}

// Load projects from file via backend
export async function loadProjectsFromFile(filePath: string = 'data/projects.json'): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8765/api/file/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: filePath,
        encoding: 'utf-8'
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.content) {
      const parsed = JSON.parse(result.content);
      const projectsMap = new Map<string, Project>();
      
      if (Array.isArray(parsed.projects)) {
        for (const project of parsed.projects) {
          projectsMap.set(project.id, project);
        }
      }

      useProjectStore.setState({
        projects: projectsMap,
        activeProjectId: parsed.activeProjectId || null,
      });

      console.log(`Projects loaded from ${filePath}`);
      return true;
    } else {
      console.log('No saved project state found in file, trying localStorage...');
      return loadProjectsFromStorage();
    }
  } catch (error) {
    console.error('Failed to load projects from file, trying localStorage...', error);
    return loadProjectsFromStorage();
  }
}
