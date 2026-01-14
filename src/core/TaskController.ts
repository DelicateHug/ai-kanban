import type { Task, Stage, Review } from './types';
import { useTaskStore, getNextStage } from './TaskStore';
import { useFileLockStore } from './FileLockManager';
import { WorkerPool, type WorkerPoolCallbacks } from './WorkerPool';
import { appendHistoryEntry } from './HistoryManager';
import { getWorkerCount, getMaxTurnCount, getPlanningAutoApprove } from './config';
import { addPlanningMessage } from './TaskStore';

// Instruction files per stage (would be loaded from file system in production)
const STAGE_INSTRUCTIONS: Record<string, string[]> = {
  summarize: ['summarize/instructions.md'],
  plan: ['plan/requirements-analysis.md', 'plan/architecture-design.md'],
  distribute: ['distribute/work-assignment.md', 'distribute/resource-allocation.md'],
  select: ['select/file-selection.md', 'select/scope-validation.md'],
  work: ['work/implementation.md', 'work/quality-assurance.md'],
  review: ['review/code-review.md', 'review/architecture-review.md', 'review/security-review.md'],
  approval: ['approval/final-approval.md']
};

class TaskController {
  private workerPool: WorkerPool | null = null;
  private isRunning = false;
  private processingTasks = new Set<string>();

  async initialize(): Promise<void> {
    const workerCount = getWorkerCount();
    
    const callbacks: WorkerPoolCallbacks = {
      onLockRequest: this.handleLockRequest.bind(this),
      onLockRelease: this.handleLockRelease.bind(this),
      onTaskComplete: this.handleTaskComplete.bind(this),
      onTaskFailed: this.handleTaskFailed.bind(this),
      onTaskWaiting: this.handleTaskWaiting.bind(this),
      onLogEntry: this.handleLogEntry.bind(this)
    };

    this.workerPool = new WorkerPool(workerCount, callbacks);
    await this.workerPool.initialize();
    
    console.log(`TaskController initialized with ${workerCount} workers`);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.processLoop();
    console.log('TaskController started');
  }

  stop(): void {
    this.isRunning = false;
    console.log('TaskController stopped');
  }

  shutdown(): void {
    this.stop();
    this.workerPool?.shutdown();
    this.workerPool = null;
    console.log('TaskController shutdown');
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      // Clean up any stuck tasks first
      this.cleanupStuckTasks();
      
      await this.processPendingTasks();
      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Clean up tasks that are stuck in 'processing' status but are not actually being processed.
   * This can happen if a worker crashes or if there's a race condition.
   */
  private cleanupStuckTasks(): void {
    const allTasks = useTaskStore.getState().tasks;
    
    for (const [taskId, task] of allTasks) {
      // If task has 'processing' status but is not in our processingTasks set,
      // it's stuck and needs to be reset to 'active'
      if (task.status === 'processing' && !this.processingTasks.has(taskId)) {
        console.warn(`[TaskController] Found stuck task ${taskId} in stage ${task.currentStage}, resetting to active`);
        useTaskStore.getState().setTaskStatus(taskId, 'active');
        
        appendHistoryEntry(
          taskId,
          'action',
          task.currentStage,
          'Task was stuck in processing status, reset to active for retry'
        );
      }
    }
  }

  private async processPendingTasks(): Promise<void> {
    if (!this.workerPool) return;

    const idleWorkers = this.workerPool.getIdleWorkerCount();
    if (idleWorkers === 0) return;

    // Get tasks that can be processed
    const processableTasks = useTaskStore.getState().getProcessableTasks();
    
    if (processableTasks.length > 0) {
      console.log(`[TaskController] Found ${processableTasks.length} processable tasks, ${idleWorkers} idle workers`);
    }
    
    for (const task of processableTasks) {
      if (this.processingTasks.has(task.id)) {
        console.log(`[TaskController] Task ${task.id} already being processed, skipping`);
        continue;
      }
      if (this.workerPool.getIdleWorkerCount() === 0) break;

      console.log(`[TaskController] Assigning task ${task.id} (stage: ${task.currentStage}, status: ${task.status})`);
      await this.assignTaskToWorker(task);
    }
  }

  private async assignTaskToWorker(task: Task): Promise<void> {
    if (!this.workerPool) return;

    const stage = task.currentStage;
    
    // Handle skipPlanning - if task should skip planning but is in plan stage, move to select
    if (task.skipPlanning && stage === 'plan') {
      console.log(`[TaskController] Task ${task.id} has skipPlanning=true, skipping to select stage`);
      useTaskStore.getState().updateTask(task.id, { planningApproved: true });
      useTaskStore.getState().moveToStage(task.id, 'select');
      return;
    }
    
    // Handle skipDistribute - if task should skip distribute, move directly to work
    if (task.skipDistribute && stage === 'distribute') {
      console.log(`[TaskController] Task ${task.id} has skipDistribute=true, skipping to work stage`);
      useTaskStore.getState().moveToStage(task.id, 'work');
      return;
    }
    
    // Handle skipReview - if task should skip review, move directly to approval
    if (task.skipReview && stage === 'review') {
      console.log(`[TaskController] Task ${task.id} has skipReview=true, skipping to approval stage`);
      useTaskStore.getState().moveToStage(task.id, 'approval');
      return;
    }
    
    // Child tasks should never go through distribute stage (they ARE the distributed work)
    if (task.isChildTask && stage === 'distribute') {
      console.warn(`[TaskController] Child task ${task.id} should not be in distribute stage, moving to work`);
      useTaskStore.getState().moveToStage(task.id, 'work');
      return;
    }
    
    // For plan stage, use the task's selected planning files; otherwise use default stage instructions
    // For review stage, use the task's selected review files
    let instructions: string[];
    if (stage === 'plan' && task.planningFiles && task.planningFiles.length > 0) {
      instructions = task.planningFiles;
    } else if (stage === 'review' && task.reviewFiles && task.reviewFiles.length > 0) {
      instructions = task.reviewFiles;
    } else {
      instructions = STAGE_INSTRUCTIONS[stage] || [];
    }

    if (!instructions || instructions.length === 0) {
      console.warn(`[TaskController] No instructions for stage: ${stage}`);
      // For plan stage with no files, still proceed but with a default message
      if (stage === 'plan') {
        instructions = ['Please analyze the task and create a plan.'];
      } else {
        return;
      }
    }

    console.log(`[TaskController] Instructions for ${stage}:`, instructions);

    // For review stage, spawn multiple workers (one per instruction file)
    if (stage === 'review') {
      this.assignReviewTasks(task, instructions);
      return;
    }

    // For plan stage, include any existing chat context
    let combinedInstructions = instructions.join('\n\n---\n\n');
    
    if (stage === 'plan' && task.planningChat.length > 0) {
      const chatContext = task.planningChat
        .map(msg => `${msg.role === 'user' ? 'Human' : 'AI'}: ${msg.content}`)
        .join('\n\n');
      combinedInstructions += `\n\n---\n\n## Previous Planning Discussion\n\n${chatContext}\n\n---\n\nPlease continue the planning based on the feedback above.`;
    }
    
    this.processingTasks.add(task.id);
    useTaskStore.getState().setTaskStatus(task.id, 'processing');
    
    const workerId = this.workerPool.assignTask(task, stage, combinedInstructions);
    
    if (!workerId) {
      this.processingTasks.delete(task.id);
      useTaskStore.getState().setTaskStatus(task.id, 'active');
    }
  }

  private assignReviewTasks(task: Task, instructions: string[]): void {
    if (!this.workerPool) return;

    this.processingTasks.add(task.id);
    useTaskStore.getState().setTaskStatus(task.id, 'processing');

    // Create a review task for each instruction file
    const pendingReviews = instructions.map((instruction, index) => ({
      instruction,
      instructionFile: instruction,
      reviewerId: `review-${index + 1}`,
      completed: false
    }));

    // Store pending reviews for tracking
    (task as Task & { pendingReviews?: typeof pendingReviews }).pendingReviews = pendingReviews;

    console.log(`[TaskController] Spawning ${pendingReviews.length} review workers for task ${task.id}`);

    // Spawn workers for each review (in parallel)
    for (const reviewTask of pendingReviews) {
      if (this.workerPool.getIdleWorkerCount() === 0) {
        // Queue remaining for later
        console.log(`[TaskController] No idle workers, queuing remaining reviews`);
        break;
      }

      const reviewTaskCopy = { 
        ...task, 
        reviewerId: reviewTask.reviewerId,
        currentInstructionFile: reviewTask.instructionFile 
      };
      this.workerPool.assignTask(
        reviewTaskCopy as Task,
        'review',
        reviewTask.instruction
      );
    }
  }

  private handleLockRequest(
    workerId: string,
    taskId: string,
    filePath: string,
    requestId: string
  ): void {
    const lockStore = useFileLockStore.getState();
    
    // Check if file is already locked
    if (lockStore.isFileLocked(filePath)) {
      // Queue the request
      const queueLength = lockStore.getQueueLength(filePath);
      this.workerPool?.queueLock(workerId, taskId, filePath, queueLength + 1);
      
      appendHistoryEntry(taskId, 'lock_queued', 'work', `Lock queued for ${filePath} (position ${queueLength + 1})`);
      
      // Request will be granted when lock is released
      lockStore
        .requestLock(workerId, `Worker-${workerId.slice(0, 8)}`, taskId, filePath)
        .then(() => {
          this.workerPool?.grantLock(workerId, requestId);
          appendHistoryEntry(taskId, 'lock_acquired', 'work', `Lock acquired for ${filePath}`);
        })
        .catch((error) => {
          this.workerPool?.denyLock(workerId, requestId, error.message);
          appendHistoryEntry(taskId, 'lock_denied', 'work', `Lock denied for ${filePath}: ${error.message}`);
        });
    } else {
      // Grant immediately
      lockStore
        .requestLock(workerId, `Worker-${workerId.slice(0, 8)}`, taskId, filePath)
        .then(() => {
          this.workerPool?.grantLock(workerId, requestId);
          appendHistoryEntry(taskId, 'lock_acquired', 'work', `Lock acquired for ${filePath}`);
        });
    }
  }

  private handleLockRelease(workerId: string, filePath: string, taskId?: string): void {
    if (filePath === '*') {
      // Release all locks for this worker (crash recovery)
      useFileLockStore.getState().releaseAllWorkerLocks(workerId);
      if (taskId) {
        appendHistoryEntry(taskId, 'lock_released', 'work', `All locks released for worker`);
      }
    } else {
      useFileLockStore.getState().releaseLock(workerId, filePath);
      if (taskId) {
        appendHistoryEntry(taskId, 'lock_released', 'work', `Lock released for ${filePath}`);
      }
    }
  }

  private handleTaskComplete(
    _workerId: string,
    taskId: string,
    stage: Stage,
    result: unknown
  ): void {
    this.processingTasks.delete(taskId);
    
    const task = useTaskStore.getState().getTask(taskId);
    if (!task) return;

    try {
      // Handle stage-specific completion
      if (stage === 'review') {
        this.handleReviewComplete(taskId, result);
        return;
      }

      // Handle distribute stage - create child tasks
      if (stage === 'distribute') {
        this.handleDistributeComplete(taskId, result);
        return;
      }

      // Handle plan stage - check if auto-approve is enabled
      if (stage === 'plan') {
        this.handlePlanComplete(taskId, result);
        return;
      }

      // Increment turn count for work stage
      if (stage === 'work') {
        useTaskStore.getState().incrementTurnCount(taskId);
        
        // Check if turn count limit reached
        const updatedTask = useTaskStore.getState().getTask(taskId);
        const maxTurns = getMaxTurnCount();
        
        if (updatedTask && updatedTask.turnCount >= maxTurns) {
          // Move to continue gate for human approval
          useTaskStore.getState().moveToStage(taskId, 'continue');
          
          appendHistoryEntry(
            taskId,
            'action',
            stage,
            `Turn count limit reached (${updatedTask.turnCount}/${maxTurns}). Moved to continue gate for human approval.`
          );
          return;
        }
      }

      // Move to next stage
      const nextStage = getNextStage(stage);
      if (nextStage) {
        useTaskStore.getState().moveToStage(taskId, nextStage);
      }

      appendHistoryEntry(
        taskId,
        'action',
        stage,
        `Stage ${stage} completed successfully`,
        { metadata: { result } }
      );
    } catch (error) {
      // On any error, move to stopped stage
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during task completion';
      useTaskStore.getState().moveTaskToStopped(taskId, errorMessage);
    }
  }

  private handlePlanComplete(taskId: string, result: unknown): void {
    const task = useTaskStore.getState().getTask(taskId);
    if (!task) return;

    try {
      // Store the AI's planning response in the chat
      const resultString = typeof result === 'string' 
        ? result 
        : JSON.stringify(result, null, 2);
      
      addPlanningMessage(taskId, 'assistant', resultString);

      // Check if auto-approve is enabled
      if (getPlanningAutoApprove()) {
        // Auto-approve: move to next stage
        useTaskStore.getState().updateTask(taskId, { planningApproved: true });
        const nextStage = getNextStage('plan');
        if (nextStage) {
          useTaskStore.getState().moveToStage(taskId, nextStage);
        }
        
        appendHistoryEntry(
          taskId,
          'action',
          'plan',
          'Planning auto-approved (planning.autoApprove is true)'
        );
      } else {
        // Require human approval: set status to blocked-human
        useTaskStore.getState().setTaskStatus(taskId, 'blocked-human');
        
        appendHistoryEntry(
          taskId,
          'action',
          'plan',
          'Planning complete. Waiting for human review and approval.'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process plan result';
      useTaskStore.getState().moveTaskToStopped(taskId, errorMessage);
    }
  }

  private handleDistributeComplete(taskId: string, result: unknown): void {
    const task = useTaskStore.getState().getTask(taskId);
    if (!task) return;

    try {
      // Parse the result to get subtasks/assignments
      const distributeResult = result as {
        subtasks?: Array<{ title: string; description: string; files?: string[] }>;
        assignments?: Array<{ title: string; description: string; files?: string[] }>;
      };

      const subtasks = distributeResult?.subtasks || distributeResult?.assignments || [];

      if (subtasks.length > 0) {
        // Create child tasks for each subtask
        subtasks.forEach((subtask, index) => {
          const childTask = useTaskStore.getState().createChildTask(
            taskId,
            subtask.title || `Subtask ${index + 1}`,
            subtask.description || task.description,
            index
          );

          if (childTask && subtask.files) {
            useTaskStore.getState().setAssignedFiles(childTask.id, subtask.files);
          }
        });

        appendHistoryEntry(
          taskId,
          'action',
          'distribute',
          `Created ${subtasks.length} child tasks for parallel processing`
        );
      }

      // Move parent task to next stage (select)
      const nextStage = getNextStage('distribute');
      if (nextStage) {
        useTaskStore.getState().moveToStage(taskId, nextStage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process distribute result';
      useTaskStore.getState().moveTaskToStopped(taskId, errorMessage);
    }
  }

  private handleReviewComplete(taskId: string, result: unknown): void {
    const task = useTaskStore.getState().getTask(taskId);
    if (!task) return;

    // Add review result
    const reviewResult = result as { verdict?: string; score?: number; reviewerId?: string; instructionFile?: string };
    const review: Review = {
      reviewerId: reviewResult.reviewerId || 'unknown',
      instructionFile: reviewResult.instructionFile || 'review/unknown.md',
      output: JSON.stringify(result),
      verdict: (reviewResult.verdict as 'approve' | 'request-changes' | 'reject') || 'approve',
      score: reviewResult.score || 0,
      timestamp: new Date().toISOString()
    };

    useTaskStore.getState().addReview(taskId, review);

    // Get updated task with the new review added
    const updatedTask = useTaskStore.getState().getTask(taskId);
    if (!updatedTask) return;

    // Determine expected number of reviews from the task's review files
    const expectedReviewCount = updatedTask.reviewFiles?.length || 3;
    
    // Check if all reviews are complete (AFTER adding the review)
    const allReviewsComplete = updatedTask.reviews.length >= expectedReviewCount;

    console.log(`[TaskController] Review complete for task ${taskId}: ${updatedTask.reviews.length}/${expectedReviewCount} reviews`);

    if (allReviewsComplete) {
      // Mark task as no longer processing
      this.processingTasks.delete(taskId);
      
      // Synthesize reviews
      const synthesis = this.synthesizeReviews(updatedTask.reviews);
      useTaskStore.getState().setReviewSynthesis(taskId, synthesis);

      // Move to approval
      useTaskStore.getState().moveToStage(taskId, 'approval');
      
      appendHistoryEntry(
        taskId,
        'action',
        'review',
        `All ${expectedReviewCount} reviews complete. Moving to approval.`
      );
    }
  }

  private synthesizeReviews(reviews: Review[]): string {
    const verdicts = reviews.map((r) => r.verdict);
    const avgScore = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
    
    const approveCount = verdicts.filter((v) => v === 'approve').length;
    const rejectCount = verdicts.filter((v) => v === 'reject').length;
    
    let overallVerdict: string;
    if (rejectCount > 0) {
      overallVerdict = 'Changes required before approval';
    } else if (approveCount === reviews.length) {
      overallVerdict = 'All reviewers approve';
    } else {
      overallVerdict = 'Mixed reviews, human decision required';
    }

    // Helper to extract agent name from instruction file path
    const getAgentName = (instructionFile: string): string => {
      // Extract filename without extension: "review/code-review.md" -> "code-review"
      const filename = instructionFile.split('/').pop()?.replace('.md', '') || 'Unknown';
      // Convert to title case: "code-review" -> "Code Review"
      return filename
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };

    // Helper to generate a concise summary from the review output
    const generateSummary = (review: Review): string => {
      try {
        // Try to parse if it's JSON
        const parsed = JSON.parse(review.output);
        const output = parsed.output || parsed.feedback || parsed.summary || '';
        
        if (output) {
          // Extract first meaningful sentence or two (up to 200 chars)
          const sentences = output.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
          const summary = sentences.slice(0, 2).join('. ').trim();
          return summary.length > 200 ? summary.slice(0, 197) + '...' : (summary || 'No summary available');
        }
      } catch {
        // Not JSON, try to extract meaningful content
        const output = review.output;
        if (output.length > 0) {
          const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 10);
          const summary = sentences.slice(0, 2).join('. ').trim();
          return summary.length > 200 ? summary.slice(0, 197) + '...' : (summary || 'No summary available');
        }
      }
      return 'Review completed';
    };

    return `
## Review Synthesis

### Summary
- **Overall Verdict**: ${overallVerdict}
- **Average Score**: ${avgScore.toFixed(1)}/100
- **Reviews**: ${reviews.length}
- **Approvals**: ${approveCount}
- **Rejections**: ${rejectCount}

### Individual Reviews
${reviews.map((r) => {
  const agentName = getAgentName(r.instructionFile);
  const summary = generateSummary(r);
  const verdictEmoji = r.verdict === 'approve' ? '✅' : r.verdict === 'reject' ? '❌' : '⚠️';
  return `
#### ${verdictEmoji} ${agentName}
- **Verdict**: ${r.verdict} | **Score**: ${r.score}/100
- **Summary**: ${summary}`;
}).join('\n')}

### Recommendation
${overallVerdict}
`.trim();
  }

  private handleTaskFailed(
    _workerId: string,
    taskId: string,
    stage: Stage,
    error: string
  ): void {
    this.processingTasks.delete(taskId);
    
    // Move task to stopped stage with error message
    useTaskStore.getState().moveTaskToStopped(taskId, `Failed at ${stage}: ${error}`);
    
    appendHistoryEntry(taskId, 'error', stage, `Task failed and moved to stopped: ${error}`);
  }

  private handleTaskWaiting(
    _workerId: string,
    taskId: string,
    filePath: string,
    queuePosition: number
  ): void {
    useTaskStore.getState().setTaskStatus(taskId, 'waiting');
    
    appendHistoryEntry(
      taskId,
      'action',
      'work',
      `Waiting for lock on ${filePath} (position ${queuePosition} in queue)`
    );
  }

  private handleLogEntry(
    _workerId: string,
    taskId: string,
    stage: Stage,
    entryType: string,
    content: string,
    options?: Record<string, unknown>
  ): void {
    appendHistoryEntry(
      taskId,
      entryType as any,
      stage,
      content,
      options as any
    );
  }

  // Public methods for UI interaction
  getWorkerStatus(): { total: number; idle: number; busy: number } {
    if (!this.workerPool) {
      return { total: 0, idle: 0, busy: 0 };
    }
    return {
      total: getWorkerCount(),
      idle: this.workerPool.getIdleWorkerCount(),
      busy: this.workerPool.getBusyWorkerCount()
    };
  }

  isTaskProcessing(taskId: string): boolean {
    return this.processingTasks.has(taskId);
  }
}

// Singleton instance
export const taskController = new TaskController();
