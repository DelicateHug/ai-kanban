/**
 * ProjectOverview - Dashboard showing all projects in a grid layout
 * Similar to Google's project selection interface
 */

import React, { useState, useMemo } from 'react';
import { useProjectStore } from '../core/ProjectStore';
import { useTaskStore } from '../core/TaskStore';
import type { Project } from '../core/types';
import { EditProjectModal } from './EditProjectModal';

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

interface ProjectOverviewProps {
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({ 
  onSelectProject,
  onCreateProject 
}) => {
  // Get the raw projects Map and derive the sorted array with useMemo
  const projectsMap = useProjectStore((state) => state.projects);
  const projects = useMemo(() => 
    Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap]
  );
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  return (
    <div 
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-8 py-6"
        style={{ 
          background: 'var(--bg-secondary)', 
          borderBottom: '1px solid var(--border-secondary)' 
        }}
      >
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: 'var(--accent-primary)', color: '#000' }}
          >
            🤖
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">AI Kanban</h1>
            <p className="text-sm text-muted">Select a project or view all tasks</p>
          </div>
        </div>
        
        <button
          onClick={onCreateProject}
          className="btn btn-primary flex items-center gap-2"
        >
          <span>➕</span>
          New Project
        </button>
      </div>

      {/* Projects Grid */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          {/* All Projects Card */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-primary mb-4">Quick Access</h2>
            <button
              onClick={() => onSelectProject(null)}
              className="w-full p-6 rounded-xl transition-all duration-200 hover:scale-[1.02] text-left"
              style={{ 
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
              }}
            >
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl"
                  style={{ background: 'rgba(255,255,255,0.2)' }}
                >
                  🌐
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold" style={{ color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>All Projects</h3>
                  <p className="text-sm opacity-90" style={{ color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                    View and manage all tasks across all projects
                  </p>
                </div>
                <svg 
                  className="w-8 h-8" 
                  style={{ color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>

          {/* Projects */}
          <h2 className="text-lg font-semibold text-primary mb-4">
            Your Projects ({projects.length})
          </h2>
          
          {projects.length === 0 ? (
            <div 
              className="text-center py-16 rounded-xl"
              style={{ 
                background: 'var(--bg-card)', 
                border: '2px dashed var(--border-secondary)' 
              }}
            >
              <div className="text-6xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-primary mb-2">No Projects Yet</h3>
              <p className="text-muted mb-6 max-w-md mx-auto">
                Create a project to organize your tasks. Each project is a folder 
                where AI tools are sandboxed by default.
              </p>
              <button
                onClick={onCreateProject}
                className="btn btn-primary"
              >
                Create Your First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isHovered={hoveredProject === project.id}
                  onMouseEnter={() => setHoveredProject(project.id)}
                  onMouseLeave={() => setHoveredProject(null)}
                  onClick={() => onSelectProject(project.id)}
                  onEdit={() => setEditingProject(project)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Project Modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onUpdated={() => setEditingProject(null)}
          onDelete={() => setEditingProject(null)}
        />
      )}
    </div>
  );
};

interface ProjectCardProps {
  project: Project;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  onEdit: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onEdit,
}) => {
  // Compute task counts dynamically from the task store
  const { taskCount, activeTaskCount } = useProjectTaskCounts(project.id);
  
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };
  
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="p-5 rounded-xl transition-all duration-200 text-left w-full relative group"
      style={{ 
        background: 'var(--bg-card)', 
        border: `2px solid ${isHovered ? project.color : 'var(--border-secondary)'}`,
        transform: isHovered ? 'translateY(-2px)' : 'none',
        boxShadow: isHovered ? `0 8px 25px ${project.color}25` : 'none'
      }}
    >
      {/* Edit Button - always visible */}
      <button
        onClick={handleEditClick}
        className="absolute top-3 right-3 p-2 rounded-lg transition-all hover:scale-110"
        style={{ 
          background: 'var(--bg-elevated)', 
          border: '1px solid var(--border-secondary)',
        }}
        title="Edit project"
      >
        <svg 
          className="w-4 h-4 transition-colors" 
          style={{ color: 'var(--text-muted)' }}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          onMouseEnter={(e) => e.currentTarget.style.color = project.color}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>

      {/* Clickable area for opening project */}
      <button
        onClick={onClick}
        className="w-full text-left"
      >
        <div className="flex items-start gap-4">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: `${project.color}20` }}
          >
            {project.icon}
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="font-semibold text-primary truncate">{project.name}</h3>
            {project.description && (
              <p className="text-sm text-muted mt-1 line-clamp-2">{project.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {taskCount} tasks
              </span>
              {activeTaskCount > 0 && (
                <span 
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: `${project.color}30`, color: project.color }}
                >
                  {activeTaskCount} active
                </span>
              )}
            </div>
          </div>
          <svg 
            className="w-5 h-5 text-muted shrink-0 transition-transform"
            style={{ transform: isHovered ? 'translateX(2px)' : 'none' }}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        
        {/* Project path */}
        <div 
          className="mt-3 pt-3 text-xs text-muted truncate"
          style={{ borderTop: '1px solid var(--border-secondary)' }}
        >
          <span className="opacity-60">📂</span> {project.path}
        </div>
      </button>
    </div>
  );
};

export default ProjectOverview;
