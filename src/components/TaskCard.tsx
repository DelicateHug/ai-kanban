import React, { useState, useRef, useEffect } from 'react';
import type { Task, Stage } from '../core/types';
import { STAGES } from '../core/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getContextStatus } from '../core/ContextManager';
import { useTaskStore } from '../core/TaskStore';
import { useProjectStore } from '../core/ProjectStore';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onClick,
  isDragging = false
}) => {
  const moveToStage = useTaskStore((state) => state.moveToStage);
  const getChildTasks = useTaskStore((state) => state.getChildTasks);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const pauseTask = useTaskStore((state) => state.pauseTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const toggleTaskRead = useTaskStore((state) => state.toggleTaskRead);

  const handleToggleRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTaskRead(task.id);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(event.target as Node)) {
        setShowMoveMenu(false);
      }
    };
    
    if (showMoveMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoveMenu]);

  const handleMoveToStage = (e: React.MouseEvent, stage: Stage) => {
    e.stopPropagation();
    moveToStage(task.id, stage);
    setShowMoveMenu(false);
  };

  const toggleMoveMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMoveMenu(!showMoveMenu);
  };

  const getStageIcon = (stage: Stage): string => {
    const icons: Record<Stage, string> = {
      stopped: '⛔',
      continue: '⏸️',
      backlog: '📋',
      summarize: '📝',
      create: '✨',
      plan: '📐',
      select: '🎯',
      distribute: '📤',
      work: '⚙️',
      review: '🔍',
      approval: '✅',
      complete: '🎉'
    };
    return icons[stage];
  };

  const handleStartTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    // If skipPlanning is true, go directly to select stage
    if (task.skipPlanning) {
      moveToStage(task.id, 'select');
    } else {
      moveToStage(task.id, 'plan');
    }
  };

  const handlePauseTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    pauseTask(task.id);
  };

  const handleResumeTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    resumeTask(task.id);
  };

  const handleDeleteTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask(task.id);
    }
  };

  const getStatusDotClass = (status: string): string => {
    const classes: Record<string, string> = {
      active: 'status-dot-active',
      waiting: 'status-dot-waiting',
      'waiting-timeout': 'status-dot-waiting',
      'blocked-human': 'status-dot-blocked',
      processing: 'status-dot-processing',
      complete: 'status-dot-complete',
      failed: 'status-dot-failed',
      stopped: 'status-dot-stopped',
      paused: 'status-dot-paused'
    };
    return classes[status] || 'status-dot-stopped';
  };

  const contextStatus = getContextStatus(task);
  const childTasks = getChildTasks(task.id);
  
  // Get project info for this task
  const project = useProjectStore((state) => 
    task.projectId ? state.getProject(task.projectId) : null
  );
  const hasChildren = childTasks.length > 0;
  const completedChildren = childTasks.filter(c => c.status === 'complete').length;

  const getContextBarClass = (status: 'safe' | 'warning' | 'critical'): string => {
    const classes = {
      safe: 'progress-success',
      warning: 'progress-warning',
      critical: 'progress-danger'
    };
    return classes[status];
  };

  // Don't show child tasks directly on board - they're shown via parent
  if (task.isChildTask) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        p-4 rounded-lg cursor-pointer transition-all duration-200
        ${isDragging ? 'opacity-50 ring-2 ring-[var(--accent-primary)]' : ''}
        ${task.errorMessage ? 'border-l-4 border-l-[var(--accent-danger)]' : ''}
      `}
      css-style={{ 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border-secondary)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 flex-1">
          {/* Read/Unread indicator */}
          <button
            onClick={handleToggleRead}
            className={`flex-shrink-0 mt-0.5 w-3 h-3 rounded-full transition-all duration-200 hover:scale-125 ${
              task.isRead ? 'opacity-30' : 'animate-pulse'
            }`}
            style={{
              background: task.isRead ? 'var(--text-muted)' : 'var(--accent-primary)',
              border: task.isRead ? '1px solid var(--border-secondary)' : 'none'
            }}
            title={task.isRead ? 'Mark as unread' : 'Mark as read'}
          />
          <h4 className="font-medium text-primary text-sm leading-tight line-clamp-2 flex-1">
            {task.title}
          </h4>
        </div>
        <span
          className={`status-dot flex-shrink-0 mt-1 ${getStatusDotClass(task.status)}`}
          title={task.status}
        />
      </div>

      {/* Project Badge */}
      {project && (
        <div 
          className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-md w-fit text-xs"
          style={{ 
            background: `${project.color}15`, 
            border: `1px solid ${project.color}30` 
          }}
        >
          <span className="text-sm">{project.icon}</span>
          <span style={{ color: project.color }}>{project.name}</span>
          {!task.allowExternalAccess && (
            <span className="opacity-60" title="Sandboxed to project folder">🔒</span>
          )}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <p className="text-xs text-muted line-clamp-2 mb-3">
          {task.description}
        </p>
      )}

      {/* Meta info */}
      <div className="flex items-center justify-between text-xs text-muted mb-3">
        <span className="flex items-center gap-1">
          <span>🔄</span> Turn: {task.turnCount}
        </span>
        {task.reviews.length > 0 && (
          <span className="flex items-center gap-1">
            <span>📝</span> Reviews: {task.reviews.length}
          </span>
        )}
      </div>

      {/* Context usage bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted mb-1">
          <span>Context</span>
          <span className={`${
            contextStatus.status === 'safe' ? 'text-success' :
            contextStatus.status === 'warning' ? 'text-warning' : 'text-danger'
          }`}>
            {contextStatus.percent}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${getContextBarClass(contextStatus.status)}`}
            style={{ width: `${Math.min(contextStatus.percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {task.currentStage === 'create' && (
          <button
            onClick={handleStartTask}
            className="btn btn-primary btn-sm w-full"
          >
            ▶ Start Task
          </button>
        )}
        {task.status === 'blocked-human' && (
          <span className="badge badge-purple">
            👤 Awaiting Human
          </span>
        )}
        {task.status === 'waiting' && (
          <span className="badge badge-warning">
            ⏳ Waiting for Lock
          </span>
        )}
        {task.status === 'processing' && (
          <span className="badge badge-info animate-pulse">
            ⚙️ Processing...
          </span>
        )}
        {task.contextSummarized && (
          <span className="badge badge-muted">
            📝 Summarized
          </span>
        )}
        {hasChildren && (
          <span className="badge badge-purple">
            🔧 {completedChildren}/{childTasks.length} subtasks
          </span>
        )}
        {task.status === 'stopped' && task.errorMessage && (
          <span className="badge badge-danger" title={task.errorMessage}>
            ⚠️ Error
          </span>
        )}
        {task.status === 'paused' && (
          <span className="badge badge-warning">
            ⏸️ Paused
          </span>
        )}
        {task.status !== 'paused' && task.status !== 'complete' && task.status !== 'stopped' && task.currentStage !== 'create' && (
          <button
            onClick={handlePauseTask}
            className="btn btn-warning btn-sm"
            title="Pause task"
          >
            ⏸️ Pause
          </button>
        )}
        {task.status === 'paused' && (
          <button
            onClick={handleResumeTask}
            className="btn btn-success btn-sm"
            title="Resume task"
          >
            ▶️ Resume
          </button>
        )}
        
        {/* Move to Stage dropdown */}
        <div className="relative" ref={moveMenuRef}>
          <button
            onClick={toggleMoveMenu}
            className="btn btn-sm"
            style={{ 
              background: 'var(--bg-elevated)', 
              border: '1px solid var(--border-secondary)',
              color: 'var(--text-secondary)'
            }}
            title="Move to another stage"
          >
            📦 Move
          </button>
          
          {showMoveMenu && (
            <div 
              className="absolute bottom-full left-0 mb-1 py-1 rounded-lg shadow-xl z-50 min-w-[160px]"
              style={{ 
                background: 'var(--bg-elevated)', 
                border: '1px solid var(--border-secondary)',
                maxHeight: '280px',
                overflowY: 'auto'
              }}
            >
              {STAGES.filter(stage => stage !== task.currentStage).map((stage) => (
                <button
                  key={stage}
                  onClick={(e) => handleMoveToStage(e, stage)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span>{getStageIcon(stage)}</span>
                  <span className="capitalize">{stage}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Delete button */}
        <button
          onClick={handleDeleteTask}
          className="btn btn-sm btn-danger"
          title="Delete task"
        >
          🗑️
        </button>
      </div>

      {/* Error message preview */}
      {task.errorMessage && (
        <div className="mt-3 p-2 rounded text-xs text-danger line-clamp-2" style={{ background: 'rgba(239,71,67,0.1)' }}>
          {task.errorMessage}
        </div>
      )}
    </div>
  );
};
