import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task, Stage } from '../core/types';
import { STAGES } from '../core/types';
import { useTaskStore, saveTasksToFile, saveTasksToStorage } from '../core/TaskStore';
import { useProjectStore, saveProjectsToFile } from '../core/ProjectStore';
import { getFullConfig } from '../core/config';
import { TaskCard } from './TaskCard';
import { TaskModal } from './TaskModal';
import { CreateTaskModal } from './CreateTaskModal';
import { HumanGateModal } from './HumanGateModal';
import { PlanningChatModal } from './PlanningChatModal';
import { SettingsModal } from './SettingsModal';
import { AgentSelectionModal } from './AgentSelectionModal';
import { ProjectSelector } from './ProjectSelector';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  currentProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  onBackToOverview?: () => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  currentProjectId = null,
  onSelectProject,
  onBackToOverview,
}) => {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [humanGateTask, setHumanGateTask] = useState<Task | null>(null);
  const [planningTask, setPlanningTask] = useState<Task | null>(null);
  const [agentSelectionTask, setAgentSelectionTask] = useState<{ task: Task; stage: 'plan' | 'review' } | null>(null);
  
  // Task creation mode settings
  const [simpleMode, setSimpleMode] = useState(() => {
    const saved = localStorage.getItem('taskCreationSimpleMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [autoStartTasks, setAutoStartTasks] = useState(() => {
    const saved = localStorage.getItem('taskCreationAutoStart');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Persist mode settings
  useEffect(() => {
    localStorage.setItem('taskCreationSimpleMode', JSON.stringify(simpleMode));
  }, [simpleMode]);
  
  useEffect(() => {
    localStorage.setItem('taskCreationAutoStart', JSON.stringify(autoStartTasks));
  }, [autoStartTasks]);
  
  // Collapsed columns state - initialize with null to detect first load
  const [collapsedColumns, setCollapsedColumns] = useState<Set<Stage> | null>(null);
  const [hasInitializedCollapse, setHasInitializedCollapse] = useState(false);
  
  // Task filtering state
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string | null | 'all'>('current');
  
  // Auto-save state
  const [countdown, setCountdown] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  const currentProject = useProjectStore((state) => 
    currentProjectId ? state.getProject(currentProjectId) : null
  );
  
  // Get all projects for the filter dropdown
  const projectsMap = useProjectStore((state) => state.projects);
  const allProjects = useMemo(() => 
    Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap]
  );

  const tasks = useTaskStore((state) => state.tasks);
  const tasksByStage = useTaskStore((state) => state.tasksByStage);
  const moveToStage = useTaskStore((state) => state.moveToStage);
  const updateTask = useTaskStore((state) => state.updateTask);

  // Save tasks function
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const config = getFullConfig();
      const filePath = config.autoSave?.filePath || 'data/tasks.json';
      await saveTasksToFile(filePath);
      await saveProjectsToFile('data/projects.json');
      saveTasksToStorage(); // Also save to localStorage as backup
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save tasks:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Auto-save timer effect
  useEffect(() => {
    const config = getFullConfig();
    const enabled = config.autoSave?.enabled ?? true;
    const intervalSeconds = config.autoSave?.intervalSeconds ?? 10;
    
    if (!enabled) {
      setCountdown(0);
      return;
    }

    // Initialize countdown
    setCountdown(intervalSeconds);

    // Countdown timer (updates every second)
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return intervalSeconds; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-save interval
    const saveInterval = setInterval(() => {
      handleSave();
    }, intervalSeconds * 1000);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(saveInterval);
    };
  }, [handleSave, showSettingsModal]); // Re-run when settings modal closes to pick up new settings

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = event.active.id as string;
    const task = tasks.get(taskId);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStage = over.id as Stage;

    const task = tasks.get(taskId);
    if (!task || task.currentStage === newStage) return;

    // Check if moving to a human gate stage
    if (newStage === 'continue' || newStage === 'approval') {
      setHumanGateTask(task);
      return;
    }

    moveToStage(taskId, newStage);
  };

  const handleTaskClick = (task: Task) => {
    // If task is at planning stage and blocked, show planning chat modal
    if (task.currentStage === 'plan' && task.status === 'blocked-human') {
      setPlanningTask(task);
    }
    // If task is at a human gate, show the gate modal
    else if (task.status === 'blocked-human') {
      setHumanGateTask(task);
    } else {
      setSelectedTask(task);
    }
  };

  const getTasksForStage = (stage: Stage): Task[] => {
    const taskIds = tasksByStage.get(stage) || [];
    return taskIds
      .map((id) => tasks.get(id)!)
      .filter(Boolean)
      .filter((task) => !task.isChildTask)  // Only show parent tasks on the board
      .filter((task) => {
        // Project filtering
        let projectMatch = true;
        if (filterProjectId === 'current') {
          // Use the current project context
          if (currentProjectId !== null) {
            projectMatch = task.projectId === currentProjectId;
          }
          // If currentProjectId is null, show all (no filtering by project)
        } else if (filterProjectId === 'all') {
          // Show all projects
          projectMatch = true;
        } else if (filterProjectId !== null) {
          // Specific project selected in filter
          projectMatch = task.projectId === filterProjectId;
        }
        
        // Search query filtering (regex through title and description)
        let searchMatch = true;
        if (taskSearchQuery.trim()) {
          try {
            const regex = new RegExp(taskSearchQuery, 'i');
            searchMatch = regex.test(task.title) || regex.test(task.description || '');
          } catch {
            // If regex is invalid, fall back to simple includes
            const query = taskSearchQuery.toLowerCase();
            searchMatch = task.title.toLowerCase().includes(query) || 
                         (task.description || '').toLowerCase().includes(query);
          }
        }
        
        return projectMatch && searchMatch;
      });
  };

  // Memoize task counts for each stage
  const stageTasks = useMemo(() => {
    const result: Record<Stage, Task[]> = {} as Record<Stage, Task[]>;
    for (const stage of STAGES) {
      result[stage] = getTasksForStage(stage);
    }
    return result;
  }, [tasks, tasksByStage, taskSearchQuery, filterProjectId, currentProjectId]);

  // Compute total filtered task count
  const totalFilteredTasks = useMemo(() => {
    return Object.values(stageTasks).reduce((sum, tasks) => sum + tasks.length, 0);
  }, [stageTasks]);

  // Compute total task count (without search filter for comparison)
  const totalTasks = useMemo(() => {
    let count = 0;
    tasks.forEach(task => {
      if (!task.isChildTask) {
        // Apply project filter but not search filter
        let projectMatch = true;
        if (filterProjectId === 'current') {
          if (currentProjectId !== null) {
            projectMatch = task.projectId === currentProjectId;
          }
        } else if (filterProjectId !== 'all' && filterProjectId !== null) {
          projectMatch = task.projectId === filterProjectId;
        }
        if (projectMatch) count++;
      }
    });
    return count;
  }, [tasks, filterProjectId, currentProjectId]);

  // Initialize collapsed columns on first load - collapse empty stages
  useEffect(() => {
    if (!hasInitializedCollapse) {
      const emptyStages = new Set<Stage>();
      for (const stage of STAGES) {
        if (stageTasks[stage].length === 0) {
          emptyStages.add(stage);
        }
      }
      setCollapsedColumns(emptyStages);
      setHasInitializedCollapse(true);
    }
  }, [hasInitializedCollapse, stageTasks]);

  // Toggle column collapse
  const toggleColumnCollapse = useCallback((stage: Stage) => {
    setCollapsedColumns(prev => {
      const newSet = new Set(prev || []);
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      return newSet;
    });
  }, []);

  // Check if a column is collapsed
  const isColumnCollapsed = useCallback((stage: Stage): boolean => {
    return collapsedColumns?.has(stage) ?? false;
  }, [collapsedColumns]);

  // Define stage colors
  const stageColors: Record<Stage, string> = {
    stopped: 'stage-stopped',
    continue: 'stage-continue',
    backlog: 'stage-backlog',
    summarize: 'stage-summarize',
    create: 'stage-create',
    plan: 'stage-plan',
    select: 'stage-select',
    distribute: 'stage-distribute',
    work: 'stage-work',
    review: 'stage-review',
    approval: 'stage-approval',
    complete: 'stage-complete'
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-4">
          {/* Project Selector */}
          {onSelectProject && onBackToOverview && (
            <ProjectSelector
              currentProjectId={currentProjectId ?? null}
              onSelectProject={onSelectProject}
              onBackToOverview={onBackToOverview}
            />
          )}
          
          {/* Show project badge if selected */}
          {currentProject && (
            <div 
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: `${currentProject.color}15`, border: `1px solid ${currentProject.color}40` }}
            >
              <span className="text-lg">{currentProject.icon}</span>
              <span className="text-sm font-medium" style={{ color: currentProject.color }}>
                {currentProject.name}
              </span>
              {currentProject && (
                <span 
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: `${currentProject.color}20` }}
                >
                  🔒 Sandboxed
                </span>
              )}
            </div>
          )}
          
          {!currentProject && currentProjectId === null && (
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: 'var(--accent-primary)', color: '#000' }}
              >
                🌐
              </div>
              <div>
                <h1 className="text-xl font-bold text-primary">All Projects</h1>
                <p className="text-xs text-muted">Viewing all tasks</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Auto-save indicator and controls */}
        <div className="flex items-center gap-4">
          {getFullConfig().autoSave?.enabled !== false && (
            <div className="flex items-center gap-3">
              {/* Countdown indicator */}
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
              >
                <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-secondary">
                  {isSaving ? (
                    <span style={{ color: 'var(--accent-primary)' }}>Saving...</span>
                  ) : (
                    <>Save in <span className="font-mono font-bold" style={{ color: 'var(--accent-primary)' }}>{countdown}s</span></>
                  )}
                </span>
              </div>
              
              {/* Save Now button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`btn btn-ghost px-3 py-1.5 text-sm flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={lastSaved ? `Last saved: ${lastSaved.toLocaleTimeString()}` : 'Save now'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save Now
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {/* Task Creation Mode Toggles */}
          <div 
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
          >
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-secondary)' }}>
              <button
                onClick={() => setSimpleMode(false)}
                className={`px-2.5 py-1 text-xs font-medium transition-all ${
                  !simpleMode ? 'text-black' : 'text-secondary hover:text-primary'
                }`}
                style={{ background: !simpleMode ? 'var(--accent-primary)' : 'transparent' }}
                title="Advanced mode: Full control over planning, distribution, and review stages"
              >
                ⚙️ Advanced
              </button>
              <button
                onClick={() => setSimpleMode(true)}
                className={`px-2.5 py-1 text-xs font-medium transition-all ${
                  simpleMode ? 'text-black' : 'text-secondary hover:text-primary'
                }`}
                style={{ background: simpleMode ? 'var(--accent-primary)' : 'transparent' }}
                title="Simple mode: Skip planning, distribution, and review for quick execution"
              >
                🚀 Simple
              </button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer" title="Auto-start tasks in Plan or Select stage">
              <input
                type="checkbox"
                checked={autoStartTasks}
                onChange={(e) => setAutoStartTasks(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[var(--accent-primary)]"
              />
              <span className="text-xs text-secondary">Auto Start</span>
            </label>
          </div>
          
          <button
            onClick={() => setShowSettingsModal(true)}
            className="btn btn-ghost p-2.5"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <span>➕</span>
            New Task
          </button>
        </div>
      </div>

      {/* Board with filter sidebar and collapsed columns */}
      <div className="flex-1 flex overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Filter sidebar - always visible on left */}
          <div 
            className="flex flex-col gap-3 p-3 shrink-0 overflow-y-auto"
            style={{ 
              background: 'var(--bg-tertiary)', 
              borderRight: '1px solid var(--border-secondary)',
              width: '200px'
            }}
          >
            {/* Filter header with count */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">
                Filters
              </span>
              <span 
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                {taskSearchQuery ? `${totalFilteredTasks} / ${totalTasks}` : totalFilteredTasks}
              </span>
            </div>

            {/* Search by title/description */}
            <div>
              <label className="text-xs font-medium text-muted uppercase tracking-wide mb-2 block">
                Search Tasks
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">🔍</span>
                <input
                  type="text"
                  placeholder="Title or description..."
                  value={taskSearchQuery}
                  onChange={(e) => setTaskSearchQuery(e.target.value)}
                  className="w-full py-2 text-sm rounded-lg bg-[var(--bg-elevated)] text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                  style={{ 
                    border: '1px solid var(--border-secondary)', 
                    paddingLeft: '2rem',
                    paddingRight: '2rem'
                  }}
                />
                {taskSearchQuery && (
                  <button
                    onClick={() => setTaskSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary text-sm"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            {/* Filter by project */}
            <div>
              <label className="text-xs font-medium text-muted uppercase tracking-wide mb-2 block">
                Project Filter
              </label>
              <select
                value={filterProjectId === null ? 'all' : (filterProjectId === 'current' ? 'current' : filterProjectId)}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'all') setFilterProjectId('all');
                  else if (value === 'current') setFilterProjectId('current');
                  else setFilterProjectId(value);
                }}
                className="w-full py-2 px-2 text-sm rounded-lg"
                style={{ 
                  background: 'var(--bg-elevated)', 
                  border: '1px solid var(--border-secondary)', 
                  color: 'var(--text-primary)'
                }}
              >
                <option value="current">📍 Current Context</option>
                <option value="all">🌐 All Projects</option>
                {allProjects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.icon} {project.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Divider */}
            {STAGES.some(stage => isColumnCollapsed(stage)) && (
              <div 
                className="border-t my-2"
                style={{ borderColor: 'var(--border-secondary)' }}
              />
            )}
            
            {/* Collapsed columns */}
            {STAGES.filter(stage => isColumnCollapsed(stage)).map((stage) => (
              <SortableContext
                key={stage}
                id={stage}
                items={stageTasks[stage].map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <KanbanColumn
                  stage={stage}
                  tasks={stageTasks[stage]}
                  colorClass={stageColors[stage]}
                  onTaskClick={handleTaskClick}
                  collapsed={true}
                  onToggleCollapse={() => toggleColumnCollapse(stage)}
                />
              </SortableContext>
            ))}
          </div>

          {/* Expanded columns - main area, horizontal scroll */}
          <div className="flex-1 overflow-x-auto p-5">
            <div className="flex gap-4 h-full min-w-max">
              {STAGES.filter(stage => !isColumnCollapsed(stage)).map((stage) => (
                <SortableContext
                  key={stage}
                  id={stage}
                  items={stageTasks[stage].map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <KanbanColumn
                    stage={stage}
                    tasks={stageTasks[stage]}
                    colorClass={stageColors[stage]}
                    onTaskClick={handleTaskClick}
                    collapsed={false}
                    onToggleCollapse={() => toggleColumnCollapse(stage)}
                  />
                </SortableContext>
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTask && (
              <TaskCard task={activeTask} isDragging onClick={() => {}} />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Modals */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSelectTask={(task) => setSelectedTask(task)}
        />
      )}

      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          defaultProjectId={currentProjectId}
          simpleMode={simpleMode}
          autoStartTasks={autoStartTasks}
        />
      )}

      {humanGateTask && (
        <HumanGateModal
          task={humanGateTask}
          onClose={() => setHumanGateTask(null)}
        />
      )}

      {planningTask && (
        <PlanningChatModal
          task={planningTask}
          onClose={() => setPlanningTask(null)}
        />
      )}

      {agentSelectionTask && (
        <AgentSelectionModal
          task={agentSelectionTask.task}
          stage={agentSelectionTask.stage}
          onClose={() => setAgentSelectionTask(null)}
          onConfirm={(selectedFiles) => {
            const { task, stage } = agentSelectionTask;
            // Update task with selected files
            if (stage === 'plan') {
              updateTask(task.id, { planningFiles: selectedFiles });
            } else {
              updateTask(task.id, { reviewFiles: selectedFiles });
            }
            // Move task to the stage
            moveToStage(task.id, stage);
            setAgentSelectionTask(null);
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};
