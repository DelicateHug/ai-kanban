import React from 'react';
import type { Task, Stage } from '../core/types';
import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import { useTaskStore } from '../core/TaskStore';

interface KanbanColumnProps {
  stage: Stage;
  tasks: Task[];
  colorClass: string;
  onTaskClick: (task: Task) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  stage,
  tasks,
  // colorClass is kept in props for backwards compatibility but uses CSS stage classes
  onTaskClick,
  collapsed = false,
  onToggleCollapse
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage
  });

  // Check if there are any unread tasks in this stage
  const hasUnreadTasks = useTaskStore((state) => state.hasUnreadTasksInStage(stage));
  const unreadCount = tasks.filter(t => !t.isRead).length;

  const formatStageName = (stage: Stage): string => {
    return stage.charAt(0).toUpperCase() + stage.slice(1);
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

  const getStageDescription = (stage: Stage): string => {
    const descriptions: Record<Stage, string> = {
      stopped: 'Failed or halted tasks',
      continue: 'Awaiting human approval to continue',
      backlog: 'Tasks waiting to start',
      summarize: 'Context being summarized',
      create: 'New tasks ready to plan',
      plan: 'Defining approach and architecture',
      select: 'Selecting agents and files',
      distribute: 'Creating subtasks',
      work: 'Active implementation',
      review: 'Code review in progress',
      approval: 'Final human approval',
      complete: 'Successfully finished'
    };
    return descriptions[stage];
  };

  // Collapsed view - compact horizontal bar for left sidebar
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        onClick={onToggleCollapse}
        className={`
          flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer
          hover:scale-[1.02] hover:brightness-110
          ${isOver ? 'ring-2 ring-[var(--accent-primary)]' : ''}
          transition-all duration-200
        `}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-secondary)',
          minWidth: '160px'
        }}
        title={`${formatStageName(stage)} - ${tasks.length} task${tasks.length !== 1 ? 's' : ''} - Click to expand`}
      >
        {/* Icon with stage color background */}
        <div 
          className={`stage-${stage} p-1.5 rounded-md flex items-center justify-center shrink-0`}
        >
          <span className="text-sm">{getStageIcon(stage)}</span>
        </div>
        
        {/* Stage name */}
        <span className="text-sm font-medium text-primary flex-1 truncate">
          {formatStageName(stage)}
        </span>
        
        {/* Task count badge - only animates when there are unread tasks */}
        <div 
          className={`px-2 py-0.5 text-xs font-bold rounded-full shrink-0 ${hasUnreadTasks ? 'animate-pulse' : ''}`}
          style={{ 
            background: hasUnreadTasks ? 'var(--accent-primary)' : (tasks.length > 0 ? 'var(--bg-elevated)' : 'var(--bg-elevated)'), 
            color: hasUnreadTasks ? '#000' : 'var(--text-muted)',
            minWidth: '24px',
            textAlign: 'center'
          }}
        >
          {hasUnreadTasks ? unreadCount : tasks.length}
        </div>
      </div>
    );
  }

  // Expanded view - full column
  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col w-72 min-w-72 rounded-xl overflow-hidden
        ${isOver ? 'ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--bg-primary)]' : ''}
        transition-all duration-200
      `}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)'
      }}
    >
      {/* Column Header */}
      <div 
        className={`p-4 border-b stage-${stage}`}
        style={{ borderColor: 'var(--border-secondary)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {/* Collapse button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.();
              }}
              className="p-1 rounded hover:bg-black/20 transition-colors"
              title="Collapse column"
            >
              <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-xl">{getStageIcon(stage)}</span>
            <h3 className="font-semibold text-primary text-base">
              {formatStageName(stage)}
            </h3>
          </div>
          <span 
            className="text-xs font-bold rounded-md flex items-center justify-center"
            style={{ 
              background: 'var(--bg-primary)', 
              color: 'var(--text-primary)',
              minWidth: '28px',
              height: '28px',
              boxShadow: 'inset 0 0 0 1px var(--border-primary)',
              padding: '0 6px'
            }}
          >
            {tasks.length}
          </span>
        </div>
        <p className="text-xs text-muted line-clamp-1">
          {getStageDescription(stage)}
        </p>
      </div>

      {/* Tasks */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-220px)]">
        {tasks.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <div className="text-3xl mb-2 opacity-50">📭</div>
            <p className="text-sm">No tasks</p>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))
        )}
      </div>
    </div>
  );
};
