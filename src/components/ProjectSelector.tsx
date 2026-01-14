/**
 * ProjectSelector - Dropdown component for switching between projects
 * Shows in the header when viewing the kanban board
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '../core/ProjectStore';
import { useTaskStore } from '../core/TaskStore';
import type { Project } from '../core/types';

// Helper to compute task counts for a project
function useProjectTaskCounts(projectId: string): { taskCount: number; activeTaskCount: number } {
  const tasks = useTaskStore((state) => state.tasks);
  
  return useMemo(() => {
    let taskCount = 0;
    let activeTaskCount = 0;
    
    tasks.forEach((task) => {
      if (task.projectId === projectId) {
        taskCount++;
        // Active = not in backlog, complete, or stopped
        if (task.currentStage !== 'backlog' && task.currentStage !== 'complete' && task.currentStage !== 'stopped') {
          activeTaskCount++;
        }
      }
    });
    
    return { taskCount, activeTaskCount };
  }, [tasks, projectId]);
}

interface ProjectSelectorProps {
  currentProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onBackToOverview: () => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  currentProjectId,
  onSelectProject,
  onBackToOverview,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const projectsMap = useProjectStore((state) => state.projects);
  const projects = useMemo(() => 
    Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap]
  );
  const currentProject = useProjectStore((state) => 
    currentProjectId ? state.getProject(currentProjectId) : null
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Project Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-[var(--bg-elevated)]"
        style={{ border: '1px solid var(--border-secondary)' }}
      >
        {currentProject ? (
          <>
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ background: `${currentProject.color}20` }}
            >
              {currentProject.icon}
            </div>
            <div className="text-left">
              <div className="font-medium text-primary text-sm">{currentProject.name}</div>
              <div className="text-xs text-muted">Project</div>
            </div>
          </>
        ) : (
          <>
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'var(--accent-primary)', color: '#000' }}
            >
              🌐
            </div>
            <div className="text-left">
              <div className="font-medium text-primary text-sm">All Projects</div>
              <div className="text-xs text-muted">Viewing all tasks</div>
            </div>
          </>
        )}
        <svg 
          className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in"
          style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-secondary)' 
          }}
        >
          {/* Back to Overview */}
          <button
            onClick={() => {
              onBackToOverview();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors text-left"
            style={{ borderBottom: '1px solid var(--border-secondary)' }}
          >
            <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-medium text-primary">Back to Project Overview</span>
          </button>

          {/* All Projects Option */}
          <button
            onClick={() => {
              onSelectProject(null);
              setIsOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors text-left ${
              !currentProjectId ? 'bg-[var(--bg-elevated)]' : ''
            }`}
          >
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ background: 'var(--accent-primary)', color: '#000' }}
            >
              🌐
            </div>
            <div className="flex-1">
              <div className="font-medium text-primary text-sm">All Projects</div>
              <div className="text-xs text-muted">View tasks from all projects</div>
            </div>
            {!currentProjectId && (
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          {/* Project List */}
          {projects.length > 0 && (
            <div 
              className="max-h-64 overflow-y-auto"
              style={{ borderTop: '1px solid var(--border-secondary)' }}
            >
              <div className="px-4 py-2 text-xs font-medium text-muted uppercase">
                Projects
              </div>
              {projects.map((project) => (
                <ProjectOption
                  key={project.id}
                  project={project}
                  isSelected={currentProjectId === project.id}
                  onSelect={() => {
                    onSelectProject(project.id);
                    setIsOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ProjectOptionProps {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
}

const ProjectOption: React.FC<ProjectOptionProps> = ({ project, isSelected, onSelect }) => {
  // Compute task counts dynamically from the task store
  const { taskCount, activeTaskCount } = useProjectTaskCounts(project.id);
  
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors text-left ${
        isSelected ? 'bg-[var(--bg-elevated)]' : ''
      }`}
    >
      <div 
        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
        style={{ background: `${project.color}20` }}
      >
        {project.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-primary text-sm truncate">{project.name}</div>
        <div className="text-xs text-muted">
          {activeTaskCount} active • {taskCount} total
        </div>
      </div>
      {isSelected && (
        <svg className="w-5 h-5 shrink-0" style={{ color: project.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
};

export default ProjectSelector;
