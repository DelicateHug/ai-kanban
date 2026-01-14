import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Task, Stage, TaskStatus, Review, FileChange, PlanningChatMessage } from './types';
import { STAGE_FLOW, HUMAN_GATE_STAGES, PROCESSABLE_STAGES } from './types';
import { appendHistoryEntry, initializeHistory } from './HistoryManager';
import { shouldSummarize, buildTaskContext, estimateTokens } from './ContextManager';

interface TaskStore {
  // State
  tasks: Map<string, Task>;
  tasksByStage: Map<Stage, string[]>;
  processingQueue: string[];
  
  // Actions
  createTask: (title: string, description: string, planningFiles?: string[], reviewFiles?: string[], allowedMcpServers?: string[], skipPlanning?: boolean, skipDistribute?: boolean, skipReview?: boolean, projectId?: string, allowExternalAccess?: boolean, initialStage?: Stage) => Task;
  deleteTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  moveToStage: (taskId: string, stage: Stage) => void;
  addReview: (taskId: string, review: Review) => void;
  setReviewSynthesis: (taskId: string, synthesis: string) => void;
  addFileChange: (taskId: string, change: FileChange) => void;
  setAssignedFiles: (taskId: string, files: string[]) => void;
  incrementTurnCount: (taskId: string) => void;
  setTaskStatus: (taskId: string, status: TaskStatus) => void;
  addCost: (taskId: string, inputTokens: number, outputTokens: number, cost: number) => void;
  setFinalOutput: (taskId: string, output: string) => void;
  
  // Child task actions
  createChildTask: (parentId: string, title: string, description: string, index: number) => Task | null;
  getChildTasks: (parentId: string) => Task[];
  getParentTask: (taskId: string) => Task | undefined;
  moveTaskToStopped: (taskId: string, errorMessage: string) => void;
  
  // Pause/Resume actions
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  
  // Read status actions
  markTaskRead: (taskId: string) => void;
  markTaskUnread: (taskId: string) => void;
  toggleTaskRead: (taskId: string) => void;
  hasUnreadTasksInStage: (stage: Stage) => boolean;
  
  // Selectors
  getTask: (taskId: string) => Task | undefined;
  getTasksInStage: (stage: Stage) => Task[];
  getProcessableTasks: () => Task[];
  getPendingHumanGateTasks: () => Task[];
  getParentTasks: () => Task[];  // Get only parent tasks (not children)
}

export const useTaskStore = create<TaskStore>()(
  subscribeWithSelector((set, get) => ({
    tasks: new Map(),
    tasksByStage: new Map([
      ['stopped', []],
      ['continue', []],
      ['backlog', []],
      ['summarize', []],
      ['create', []],
      ['plan', []],
      ['select', []],
      ['distribute', []],
      ['work', []],
      ['review', []],
      ['approval', []],
      ['complete', []]
    ]),
    processingQueue: [],

    createTask: (title: string, description: string, planningFiles?: string[], reviewFiles?: string[], allowedMcpServers?: string[], skipPlanning?: boolean, skipDistribute?: boolean, skipReview?: boolean, projectId?: string, allowExternalAccess?: boolean, initialStage?: Stage): Task => {
      const id = uuidv4();
      const now = new Date().toISOString();
      const targetStage = initialStage || 'create';
      
      const task: Task = {
        id,
        title,
        description,
        currentStage: targetStage,
        status: 'active',
        turnCount: 0,
        workingContext: '',
        assignedFiles: [],
        changedFiles: [],
        reviews: [],
        reviewSynthesis: '',
        planningChat: [],
        planningApproved: false,
        planningFiles: planningFiles || [],
        reviewFiles: reviewFiles || [],
        allowedMcpServers: allowedMcpServers || [],
        contextSummarized: false,
        currentTokens: 0,
        skipPlanning: skipPlanning || false,
        skipDistribute: skipDistribute || false,
        skipReview: skipReview || false,
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        finalOutput: '',
        projectId: projectId,
        allowExternalAccess: allowExternalAccess || false,
        isRead: false,
        createdAt: now,
        updatedAt: now
      };

      // Initialize history
      initializeHistory(id);
      
      // Log task creation
      appendHistoryEntry(id, 'action', 'create', `Task created: ${title}`);

      set((state) => {
        const newTasks = new Map(state.tasks);
        newTasks.set(id, task);

        const newTasksByStage = new Map(state.tasksByStage);
        const stageTasks = [...(newTasksByStage.get(targetStage) || []), id];
        newTasksByStage.set(targetStage, stageTasks);

        return { tasks: newTasks, tasksByStage: newTasksByStage };
      });

      return task;
    },

    deleteTask: (taskId: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const newTasks = new Map(state.tasks);
        newTasks.delete(taskId);

        const newTasksByStage = new Map(state.tasksByStage);
        const stageTasks = newTasksByStage.get(task.currentStage) || [];
        newTasksByStage.set(task.currentStage, stageTasks.filter((id) => id !== taskId));

        return { tasks: newTasks, tasksByStage: newTasksByStage };
      });
    },

    updateTask: (taskId: string, updates: Partial<Task>): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          ...updates,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        return { tasks: newTasks };
      });
    },

    moveToStage: (taskId: string, newStage: Stage): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const oldStage = task.currentStage;
        
        // Check if summarization is needed before moving to new stage
        let shouldGoToSummarize = false;
        if (newStage !== 'summarize' && PROCESSABLE_STAGES.includes(newStage)) {
          shouldGoToSummarize = shouldSummarize(task, newStage);
        }

        const targetStage = shouldGoToSummarize ? 'summarize' : newStage;
        
        // Determine new status
        let newStatus: TaskStatus = task.status;
        if (HUMAN_GATE_STAGES.includes(targetStage)) {
          newStatus = 'blocked-human';
        } else if (targetStage === 'complete') {
          newStatus = 'complete';
        } else if (targetStage === 'stopped') {
          newStatus = 'stopped';
        } else {
          newStatus = 'active';
        }

        const updatedTask: Task = {
          ...task,
          currentStage: targetStage,
          status: newStatus,
          updatedAt: new Date().toISOString()
        };

        // Update task context tokens
        const context = buildTaskContext(updatedTask);
        updatedTask.currentTokens = estimateTokens(context);

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        // Update stage mappings
        const newTasksByStage = new Map(state.tasksByStage);
        
        // Remove from old stage
        const oldStageTasks = newTasksByStage.get(oldStage) || [];
        newTasksByStage.set(oldStage, oldStageTasks.filter((id) => id !== taskId));
        
        // Add to new stage
        const newStageTasks = [...(newTasksByStage.get(targetStage) || []), taskId];
        newTasksByStage.set(targetStage, newStageTasks);

        // Log stage change
        appendHistoryEntry(
          taskId,
          'stage_change',
          targetStage,
          `Moved from ${oldStage} to ${targetStage}${shouldGoToSummarize ? ' (context exceeded threshold, routing to summarize)' : ''}`
        );

        return { tasks: newTasks, tasksByStage: newTasksByStage };
      });
    },

    addReview: (taskId: string, review: Review): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          reviews: [...task.reviews, review],
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        // Log review addition
        appendHistoryEntry(
          taskId,
          'action',
          'review',
          `Review added from ${review.reviewerId}: ${review.verdict} (score: ${review.score})`,
          { metadata: { reviewerId: review.reviewerId, verdict: review.verdict, score: review.score } }
        );

        return { tasks: newTasks };
      });
    },

    setReviewSynthesis: (taskId: string, synthesis: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          reviewSynthesis: synthesis,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          'review',
          'Review synthesis completed'
        );

        return { tasks: newTasks };
      });
    },

    addFileChange: (taskId: string, change: FileChange): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        // Check if we already have a change for this file - if so, update it instead of adding duplicate
        const existingIndex = task.changedFiles.findIndex(f => f.file === change.file);
        let newChangedFiles: FileChange[];
        
        if (existingIndex >= 0) {
          // Update existing entry - preserve the original contentBefore, update the rest
          const existing = task.changedFiles[existingIndex];
          const updatedChange: FileChange = {
            ...change,
            // Keep the original contentBefore snapshot (the state before any changes)
            contentBefore: existing.contentBefore ?? change.contentBefore,
            // Update contentAfter to the latest
            contentAfter: change.contentAfter,
            // Update description to show it was modified multiple times
            description: change.description,
            timestamp: change.timestamp || new Date().toISOString()
          };
          newChangedFiles = [...task.changedFiles];
          newChangedFiles[existingIndex] = updatedChange;
        } else {
          // Add new entry
          newChangedFiles = [...task.changedFiles, {
            ...change,
            timestamp: change.timestamp || new Date().toISOString()
          }];
        }

        const updatedTask: Task = {
          ...task,
          changedFiles: newChangedFiles,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'file_change',
          task.currentStage,
          `File ${change.action}: ${change.file}`,
          { file: change.file, diff: change.diff }
        );

        return { tasks: newTasks };
      });
    },

    setAssignedFiles: (taskId: string, files: string[]): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          assignedFiles: files,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          'select',
          `Assigned ${files.length} files: ${files.join(', ')}`
        );

        return { tasks: newTasks };
      });
    },

    incrementTurnCount: (taskId: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          turnCount: task.turnCount + 1,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          task.currentStage,
          `Turn count incremented to ${updatedTask.turnCount}`
        );

        return { tasks: newTasks };
      });
    },

    setTaskStatus: (taskId: string, status: TaskStatus): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          status,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          task.currentStage,
          `Status changed to ${status}`
        );

        return { tasks: newTasks };
      });
    },

    addCost: (taskId: string, inputTokens: number, outputTokens: number, cost: number): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          totalInputTokens: task.totalInputTokens + inputTokens,
          totalOutputTokens: task.totalOutputTokens + outputTokens,
          totalCost: task.totalCost + cost,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        return { tasks: newTasks };
      });
    },

    setFinalOutput: (taskId: string, output: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const updatedTask: Task = {
          ...task,
          finalOutput: output,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          task.currentStage,
          'Final output set'
        );

        return { tasks: newTasks };
      });
    },

    getTask: (taskId: string): Task | undefined => {
      return get().tasks.get(taskId);
    },

    getTasksInStage: (stage: Stage): Task[] => {
      const state = get();
      const taskIds = state.tasksByStage.get(stage) || [];
      return taskIds.map((id) => state.tasks.get(id)!).filter(Boolean);
    },

    getProcessableTasks: (): Task[] => {
      const state = get();
      const tasks: Task[] = [];
      
      for (const stage of PROCESSABLE_STAGES) {
        const stageTasks = state.getTasksInStage(stage);
        tasks.push(...stageTasks.filter((t) => t.status === 'active'));
      }
      
      return tasks;
    },

    getPendingHumanGateTasks: (): Task[] => {
      const state = get();
      const tasks: Task[] = [];
      
      for (const stage of HUMAN_GATE_STAGES) {
        const stageTasks = state.getTasksInStage(stage);
        tasks.push(...stageTasks.filter((t) => t.status === 'blocked-human'));
      }
      
      return tasks;
    },

    // Child task methods
    createChildTask: (parentId: string, title: string, description: string, index: number): Task | null => {
      const parent = get().tasks.get(parentId);
      if (!parent) return null;

      const id = uuidv4();
      const now = new Date().toISOString();

      // Child tasks start at 'work' stage - they skip plan/select/distribute
      // since they ARE the distributed work units
      const childTask: Task = {
        id,
        title,
        description,
        currentStage: 'work',  // Child tasks start at work stage
        status: 'active',
        turnCount: 0,
        workingContext: parent.workingContext,  // Inherit parent's context
        assignedFiles: [],
        changedFiles: [],
        reviews: [],
        reviewSynthesis: '',
        planningChat: [],
        planningApproved: true,  // Already planned by parent
        planningFiles: parent.planningFiles || [],  // Inherit parent's planning files
        reviewFiles: parent.reviewFiles || [],      // Inherit parent's review files
        allowedMcpServers: parent.allowedMcpServers || [],  // Inherit parent's MCP servers
        contextSummarized: false,
        currentTokens: parent.currentTokens,
        skipPlanning: true,  // Child tasks always skip planning
        skipDistribute: true,  // Child tasks always skip distribute (they ARE the distributed work)
        skipReview: parent.skipReview || false,  // Inherit parent's skipReview setting
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        finalOutput: '',
        allowExternalAccess: parent.allowExternalAccess || false,
        isRead: false,
        createdAt: now,
        updatedAt: now,
        // Child task specific fields
        parentId,
        isChildTask: true,
        childIndex: index
      };

      // Initialize history for child
      initializeHistory(id);
      appendHistoryEntry(id, 'action', childTask.currentStage, `Child task created: ${title} (index: ${index})`);

      set((state) => {
        const newTasks = new Map(state.tasks);
        newTasks.set(id, childTask);

        // Update parent to include this child
        const parentTask = newTasks.get(parentId);
        if (parentTask) {
          const updatedParent: Task = {
            ...parentTask,
            childIds: [...(parentTask.childIds || []), id],
            updatedAt: now
          };
          newTasks.set(parentId, updatedParent);
        }

        // Add to stage mapping - use 'work' stage for child tasks
        const newTasksByStage = new Map(state.tasksByStage);
        const stageTasks = [...(newTasksByStage.get('work') || []), id];
        newTasksByStage.set('work', stageTasks);

        return { tasks: newTasks, tasksByStage: newTasksByStage };
      });

      return childTask;
    },

    getChildTasks: (parentId: string): Task[] => {
      const parent = get().tasks.get(parentId);
      if (!parent || !parent.childIds) return [];

      return parent.childIds
        .map(id => get().tasks.get(id))
        .filter((t): t is Task => t !== undefined)
        .sort((a, b) => (a.childIndex || 0) - (b.childIndex || 0));
    },

    getParentTask: (taskId: string): Task | undefined => {
      const task = get().tasks.get(taskId);
      if (!task || !task.parentId) return undefined;
      return get().tasks.get(task.parentId);
    },

    moveTaskToStopped: (taskId: string, errorMessage: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;

        const oldStage = task.currentStage;

        const updatedTask: Task = {
          ...task,
          currentStage: 'stopped',
          status: 'stopped',
          errorMessage,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        // Update stage mappings
        const newTasksByStage = new Map(state.tasksByStage);
        
        // Remove from old stage
        const oldStageTasks = newTasksByStage.get(oldStage) || [];
        newTasksByStage.set(oldStage, oldStageTasks.filter((id) => id !== taskId));
        
        // Add to stopped stage
        const stoppedTasks = [...(newTasksByStage.get('stopped') || []), taskId];
        newTasksByStage.set('stopped', stoppedTasks);

        appendHistoryEntry(
          taskId,
          'error',
          'stopped',
          `Task moved to stopped: ${errorMessage}`
        );

        return { tasks: newTasks, tasksByStage: newTasksByStage };
      });
    },

    pauseTask: (taskId: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task) return state;
        
        // Store the previous status so we can restore it on resume
        const updatedTask: Task = {
          ...task,
          status: 'paused',
          previousStatus: task.status,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          task.currentStage,
          'Task paused by user'
        );

        return { tasks: newTasks };
      });
    },

    resumeTask: (taskId: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task || task.status !== 'paused') return state;
        
        // Restore to previous status or 'active' if not available
        const previousStatus = task.previousStatus || 'active';
        
        const updatedTask: Task = {
          ...task,
          status: previousStatus,
          previousStatus: undefined,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        appendHistoryEntry(
          taskId,
          'action',
          task.currentStage,
          `Task resumed (restored to ${previousStatus} status)`
        );

        return { tasks: newTasks };
      });
    },

    markTaskRead: (taskId: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task || task.isRead) return state;
        
        const updatedTask: Task = {
          ...task,
          isRead: true,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        return { tasks: newTasks };
      });
    },

    markTaskUnread: (taskId: string): void => {
      set((state) => {
        const task = state.tasks.get(taskId);
        if (!task || !task.isRead) return state;
        
        const updatedTask: Task = {
          ...task,
          isRead: false,
          updatedAt: new Date().toISOString()
        };

        const newTasks = new Map(state.tasks);
        newTasks.set(taskId, updatedTask);

        return { tasks: newTasks };
      });
    },

    toggleTaskRead: (taskId: string): void => {
      const task = get().tasks.get(taskId);
      if (!task) return;
      
      if (task.isRead) {
        get().markTaskUnread(taskId);
      } else {
        get().markTaskRead(taskId);
      }
    },

    hasUnreadTasksInStage: (stage: Stage): boolean => {
      const state = get();
      const taskIds = state.tasksByStage.get(stage) || [];
      return taskIds.some(id => {
        const task = state.tasks.get(id);
        return task && !task.isRead;
      });
    },

    getParentTasks: (): Task[] => {
      const state = get();
      return Array.from(state.tasks.values()).filter(t => !t.isChildTask);
    }
  }))
);

// Helper to get next stage
export function getNextStage(currentStage: Stage): Stage | null {
  return STAGE_FLOW[currentStage] || null;
}

// Helper to advance task to next stage
export function advanceTask(taskId: string): void {
  const task = useTaskStore.getState().getTask(taskId);
  if (!task) return;

  const nextStage = getNextStage(task.currentStage);
  if (nextStage) {
    useTaskStore.getState().moveToStage(taskId, nextStage);
  }
}

// Helper for human to approve continuation at gates
export function approveHumanGate(taskId: string): void {
  const task = useTaskStore.getState().getTask(taskId);
  if (!task) return;

  if (task.currentStage === 'continue') {
    // Reset turn count to allow another round of processing
    useTaskStore.getState().updateTask(taskId, { turnCount: 0 });
    // Continue goes back to work
    useTaskStore.getState().moveToStage(taskId, 'work');
    
    appendHistoryEntry(
      taskId,
      'human_input',
      task.currentStage,
      `Human approved continuation. Turn count reset to 0.`
    );
  } else if (task.currentStage === 'approval') {
    // Generate final output before completing
    const finalOutput = generateFinalOutput(task);
    useTaskStore.getState().setFinalOutput(taskId, finalOutput);
    
    // Approval moves to complete
    useTaskStore.getState().moveToStage(taskId, 'complete');
    
    appendHistoryEntry(
      taskId,
      'human_input',
      task.currentStage,
      `Human approved at ${task.currentStage} gate`
    );
  }
}

// Generate final output summary for a completed task
function generateFinalOutput(task: Task): string {
  const sections: string[] = [];
  
  sections.push(`# Task Completed: ${task.title}`);
  sections.push(`\n## Summary`);
  sections.push(`- **Status**: Complete`);
  sections.push(`- **Total Turns**: ${task.turnCount}`);
  sections.push(`- **Total Cost**: $${task.totalCost?.toFixed(4) || '0.0000'}`);
  sections.push(`- **Tokens Used**: ${((task.totalInputTokens || 0) + (task.totalOutputTokens || 0)).toLocaleString()}`);
  
  if (task.changedFiles.length > 0) {
    sections.push(`\n## Files Changed (${task.changedFiles.length})`);
    task.changedFiles.forEach(change => {
      sections.push(`- **${change.action}**: ${change.file}`);
      if (change.description) {
        sections.push(`  - ${change.description}`);
      }
    });
  }
  
  if (task.reviewSynthesis) {
    sections.push(`\n${task.reviewSynthesis}`);
  }
  
  sections.push(`\n---`);
  sections.push(`*Completed at ${new Date().toISOString()}*`);
  
  return sections.join('\n');
}

// Helper to reject/stop task at human gate
export function rejectHumanGate(taskId: string, reason: string): void {
  const task = useTaskStore.getState().getTask(taskId);
  if (!task) return;

  useTaskStore.getState().moveToStage(taskId, 'stopped');
  
  appendHistoryEntry(
    taskId,
    'human_input',
    task.currentStage,
    `Human rejected at ${task.currentStage} gate: ${reason}`
  );
}

// Planning chat helpers
export function addPlanningMessage(taskId: string, role: 'user' | 'assistant', content: string): void {
  const task = useTaskStore.getState().getTask(taskId);
  if (!task) return;

  const message: PlanningChatMessage = {
    id: uuidv4(),
    role,
    content,
    timestamp: new Date().toISOString()
  };

  const updatedChat = [...task.planningChat, message];
  useTaskStore.getState().updateTask(taskId, { planningChat: updatedChat });

  appendHistoryEntry(
    taskId,
    role === 'user' ? 'human_input' : 'ai_response',
    'plan',
    `Planning ${role}: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`
  );
}

export function approvePlanning(taskId: string): void {
  const task = useTaskStore.getState().getTask(taskId);
  if (!task || task.currentStage !== 'plan') return;

  useTaskStore.getState().updateTask(taskId, { planningApproved: true });
  
  // Move to next stage
  const nextStage = getNextStage('plan');
  if (nextStage) {
    useTaskStore.getState().moveToStage(taskId, nextStage);
  }

  appendHistoryEntry(
    taskId,
    'human_input',
    'plan',
    'Human approved the planning'
  );
}

export function requestPlanningChanges(taskId: string, feedback: string): void {
  const task = useTaskStore.getState().getTask(taskId);
  if (!task || task.currentStage !== 'plan') return;

  // Add user feedback to chat
  addPlanningMessage(taskId, 'user', feedback);
  
  // Reset status to active so worker can pick it up again
  useTaskStore.getState().setTaskStatus(taskId, 'active');
}

// ============ Task Persistence Functions ============

interface SerializedTaskState {
  tasks: [string, Task][];
  tasksByStage: [Stage, string[]][];
  savedAt: string;
  version: string;
}

const STORAGE_KEY = 'ai-kanban-tasks';

// Serialize current state to JSON string
export function serializeTaskState(): string {
  const state = useTaskStore.getState();
  const serialized: SerializedTaskState = {
    tasks: Array.from(state.tasks.entries()),
    tasksByStage: Array.from(state.tasksByStage.entries()),
    savedAt: new Date().toISOString(),
    version: '1.0'
  };
  return JSON.stringify(serialized, null, 2);
}

// Restore state from JSON string
export function deserializeTaskState(json: string): boolean {
  try {
    const data: SerializedTaskState = JSON.parse(json);
    
    // Validate version
    if (!data.version || !data.tasks || !data.tasksByStage) {
      console.error('Invalid task state format');
      return false;
    }

    // Reconstruct Maps
    const tasks = new Map<string, Task>(data.tasks);
    const tasksByStage = new Map<Stage, string[]>(data.tasksByStage);

    // Reset any 'processing' tasks to 'active' so they can be resumed after refresh
    // This handles the case where the app was closed/refreshed while tasks were being processed
    // Also migrate existing tasks to have isRead property (defaulting to true for existing tasks)
    let resetCount = 0;
    let migratedCount = 0;
    tasks.forEach((task, id) => {
      let needsUpdate = false;
      let updatedTask = { ...task };
      
      if (task.status === 'processing') {
        updatedTask.status = 'active';
        resetCount++;
        needsUpdate = true;
      }
      
      // Migrate tasks that don't have isRead property (default to true so existing tasks don't all blink)
      if (typeof task.isRead !== 'boolean') {
        updatedTask.isRead = true;
        migratedCount++;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        tasks.set(id, updatedTask);
      }
    });
    
    if (resetCount > 0) {
      console.log(`Reset ${resetCount} processing tasks to active for resumption`);
    }
    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} tasks to have isRead property`);
    }

    // Update store
    useTaskStore.setState({ tasks, tasksByStage });
    
    console.log(`Restored ${tasks.size} tasks from saved state (saved at: ${data.savedAt})`);
    return true;
  } catch (error) {
    console.error('Failed to deserialize task state:', error);
    return false;
  }
}

// Save tasks to localStorage
export function saveTasksToStorage(): boolean {
  try {
    const json = serializeTaskState();
    localStorage.setItem(STORAGE_KEY, json);
    console.log(`Tasks saved to localStorage (${useTaskStore.getState().tasks.size} tasks)`);
    return true;
  } catch (error) {
    console.error('Failed to save tasks to localStorage:', error);
    return false;
  }
}

// Load tasks from localStorage
export function loadTasksFromStorage(): boolean {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    
    if (!json) {
      console.log('No saved task state found in localStorage');
      return false;
    }
    
    return deserializeTaskState(json);
  } catch (error) {
    console.error('Failed to load tasks from localStorage:', error);
    return false;
  }
}

// Save tasks to file via backend API (with localStorage fallback)
export async function saveTasksToFile(filePath: string): Promise<boolean> {
  // Always save to localStorage first as backup
  saveTasksToStorage();
  
  try {
    const json = serializeTaskState();
    
    const response = await fetch('http://localhost:8765/api/file/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: filePath,
        content: json,
        encoding: 'utf-8',
        createDirectories: true
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`Tasks saved to ${filePath}`);
      return true;
    } else {
      console.error('Failed to save tasks to file:', result.error);
      return true; // localStorage succeeded
    }
  } catch (error) {
    console.error('Failed to save tasks to file (localStorage fallback used):', error);
    return true; // localStorage succeeded
  }
}

// Load tasks from file via backend API (with localStorage fallback)
export async function loadTasksFromFile(filePath: string): Promise<boolean> {
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
      return deserializeTaskState(result.content);
    } else {
      console.log('No saved task state found in file, trying localStorage...');
      return loadTasksFromStorage();
    }
  } catch (error) {
    console.error('Failed to load tasks from file, trying localStorage...', error);
    return loadTasksFromStorage();
  }
}

// Get task count for UI
export function getTaskCount(): number {
  return useTaskStore.getState().tasks.size;
}

// Get last save timestamp from localStorage
export function getLastSaveTime(): string | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) {
      const data: SerializedTaskState = JSON.parse(json);
      return data.savedAt;
    }
  } catch {
    // ignore
  }
  return null;
}
