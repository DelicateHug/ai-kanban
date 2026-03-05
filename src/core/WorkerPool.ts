import type { WorkerMessage, Task, Stage, MCPToolDefinition, ToolResult } from './types';
import { getOrCreateStageClient, buildMessages } from './AIClient';
import { useTaskStore } from './TaskStore';
import { useFileLockStore } from './FileLockManager';
import { validatePathForTask } from './PathSandbox';
import { useProjectStore } from './ProjectStore';

/**
 * Generate a unified diff between two file contents
 * This creates a format similar to git diff output
 */
function generateUnifiedDiff(
  contentBefore: string | undefined,
  contentAfter: string | undefined,
  filePath: string
): string {
  const oldLines = contentBefore?.split('\n') || [];
  const newLines = contentAfter?.split('\n') || [];
  
  // Generate header
  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`
  ];
  
  // If one side is empty, show all lines as added/removed
  if (oldLines.length === 0 || (oldLines.length === 1 && oldLines[0] === '')) {
    // New file - all lines are additions
    if (newLines.length === 0 || (newLines.length === 1 && newLines[0] === '')) {
      return header.join('\n') + '\n@@ -0,0 +0,0 @@';
    }
    const changes = newLines.map(line => `+${line}`);
    return [
      ...header,
      `@@ -0,0 +1,${newLines.length} @@`,
      ...changes
    ].join('\n');
  }
  
  if (newLines.length === 0 || (newLines.length === 1 && newLines[0] === '')) {
    // File deleted - all lines are removals
    const changes = oldLines.map(line => `-${line}`);
    return [
      ...header,
      `@@ -1,${oldLines.length} +0,0 @@`,
      ...changes
    ].join('\n');
  }
  
  // Simple diff algorithm: find changes
  const diffLines: string[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);
  let contextStart = -1;
  let oldStart = 0;
  let newStart = 0;
  let oldCount = 0;
  let newCount = 0;
  const pendingLines: string[] = [];
  
  const flushHunk = () => {
    if (pendingLines.length > 0) {
      diffLines.push(`@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`);
      diffLines.push(...pendingLines);
      pendingLines.length = 0;
    }
  };
  
  for (let i = 0; i < maxLines; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;
    
    if (oldLine === newLine) {
      // Context line
      if (contextStart === -1 && pendingLines.length > 0) {
        // End of change block - flush with some context
        pendingLines.push(` ${oldLine}`);
        oldCount++;
        newCount++;
        if (pendingLines.filter(l => l.startsWith(' ')).length >= 3) {
          flushHunk();
          contextStart = -1;
          oldStart = i + 1;
          newStart = i + 1;
          oldCount = 0;
          newCount = 0;
        }
      } else if (pendingLines.length === 0) {
        // Not in a change block
        oldStart = i;
        newStart = i;
      } else {
        pendingLines.push(` ${oldLine}`);
        oldCount++;
        newCount++;
      }
    } else {
      // Start or continue a change block
      if (contextStart === -1 && pendingLines.length === 0) {
        // Add context before change
        const contextLines = Math.min(3, i);
        for (let c = i - contextLines; c < i; c++) {
          if (c >= 0 && c < oldLines.length) {
            pendingLines.push(` ${oldLines[c]}`);
            oldCount++;
            newCount++;
          }
        }
        oldStart = Math.max(0, i - contextLines);
        newStart = Math.max(0, i - contextLines);
      }
      
      if (oldLine !== undefined && (newLine === undefined || oldLine !== newLine)) {
        pendingLines.push(`-${oldLine}`);
        oldCount++;
      }
      if (newLine !== undefined && (oldLine === undefined || oldLine !== newLine)) {
        pendingLines.push(`+${newLine}`);
        newCount++;
      }
    }
  }
  
  flushHunk();
  
  if (diffLines.length === 0) {
    // No changes detected
    return header.join('\n') + '\n@@ -0,0 +0,0 @@ No changes';
  }
  
  return [...header, ...diffLines].join('\n');
}

// Worker script content - now requests AI from main thread
const workerCode = `
let workerId = '';
let workerName = '';

// Pending lock requests and AI requests
const pendingLocks = new Map();
const pendingAI = new Map();

self.onmessage = async function(e) {
  const message = e.data;
  
  switch (message.type) {
    case 'INIT':
      workerId = message.workerId;
      workerName = message.workerName || 'Worker-' + workerId.slice(0, 8);
      self.postMessage({ type: 'INIT', workerId, status: 'ready' });
      break;
      
    case 'PROCESS_TASK':
      await processTask(message.task, message.stage, message.instructions);
      break;
      
    case 'AI_RESPONSE':
      const aiResolver = pendingAI.get(message.requestId);
      if (aiResolver) {
        pendingAI.delete(message.requestId);
        if (message.error) {
          aiResolver.reject(new Error(message.error));
        } else {
          aiResolver.resolve(message.result);
        }
      }
      break;
      
    case 'LOCK_GRANTED':
      const grantedResolver = pendingLocks.get(message.requestId);
      if (grantedResolver) {
        pendingLocks.delete(message.requestId);
        grantedResolver.resolve();
      }
      break;
      
    case 'LOCK_DENIED':
      const deniedResolver = pendingLocks.get(message.requestId);
      if (deniedResolver) {
        pendingLocks.delete(message.requestId);
        deniedResolver.reject(new Error('Lock denied: ' + message.reason));
      }
      break;
      
    case 'LOCK_QUEUED':
      // Lock is queued, waiting for grant
      self.postMessage({
        type: 'TASK_WAITING',
        workerId,
        taskId: message.taskId,
        filePath: message.filePath,
        queuePosition: message.position
      });
      break;
      
    case 'SHUTDOWN':
      self.postMessage({ type: 'SHUTDOWN', workerId, status: 'shutdown' });
      self.close();
      break;
  }
};

async function requestAI(taskId, stage, systemPrompt, userPrompt) {
  const requestId = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    pendingAI.set(requestId, { resolve, reject });
    
    self.postMessage({
      type: 'AI_REQUEST',
      workerId,
      taskId,
      stage,
      requestId,
      systemPrompt,
      userPrompt
    });
  });
}

async function requestFileLock(taskId, filePath) {
  const requestId = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    pendingLocks.set(requestId, { resolve, reject });
    
    self.postMessage({
      type: 'LOCK_REQUEST',
      workerId,
      taskId,
      filePath,
      requestId
    });
  });
}

function releaseFileLock(filePath) {
  self.postMessage({
    type: 'LOCK_RELEASE',
    workerId,
    filePath
  });
}

function logEntry(taskId, stage, type, content, options = {}) {
  self.postMessage({
    type: 'LOG_ENTRY',
    workerId,
    taskId,
    stage,
    entryType: type,
    content,
    options
  });
}

async function processTask(task, stage, instructions) {
  try {
    logEntry(task.id, stage, 'action', 'Worker started processing task');
    logEntry(task.id, stage, 'thought', 'Preparing AI request for stage: ' + stage);
    
    // Build system prompt based on stage
    const systemPrompt = buildSystemPrompt(task, stage, instructions);
    const userPrompt = buildUserPrompt(task, stage, instructions);
    
    logEntry(task.id, stage, 'thought', 'Calling AI for ' + stage + ' stage...');
    
    // Request AI processing from main thread
    const result = await requestAI(task.id, stage, systemPrompt, userPrompt);
    
    logEntry(task.id, stage, 'ai_response', result.content, { tokens: result.tokensUsed?.total || 0 });
    
    // Parse result based on stage
    const parsedResult = parseStageResult(stage, result.content, task);
    
    // For review tasks, include the reviewerId and instructionFile from the task
    const finalResult = stage === 'review' 
      ? { ...parsedResult, reviewerId: task.reviewerId, instructionFile: task.currentInstructionFile || instructions }
      : parsedResult;
    
    self.postMessage({
      type: 'TASK_COMPLETE',
      workerId,
      taskId: task.id,
      data: { stage, result: finalResult }
    });
    
  } catch (error) {
    logEntry(task.id, stage, 'error', error.message);
    
    self.postMessage({
      type: 'TASK_FAILED',
      workerId,
      taskId: task.id,
      data: { stage },
      error: error.message
    });
  }
}

function buildSystemPrompt(task, stage, instructions) {
  const basePrompts = {
    'summarize': 'You are an AI assistant tasked with summarizing context for a task. Provide a concise summary of the task requirements and any relevant context.',
    'plan': 'You are an AI assistant that creates detailed implementation plans. Analyze the task and create a structured plan with clear steps.',
    'distribute': 'You are an AI assistant that breaks down tasks into subtasks and distributes work. Return a JSON object with a "subtasks" array containing objects with "title" and "description" fields.',
    'select': 'You are an AI file selection agent. Your job is to USE THE AVAILABLE TOOLS to search the codebase and identify all relevant files for the task. You MUST use grep_search to find where relevant code/text exists, and list_directory to explore the project structure. Do NOT guess - search first! After searching, return a JSON object with "selectedFiles" array containing objects with "path", "relevance", and "reason" fields.',
    'work': 'You are an AI coding assistant. Execute the given task and provide detailed output. If the task involves running commands, describe what the commands would output. For coding tasks, provide the actual code or changes.',
    'review': 'You are a code reviewer. Review the work done and provide feedback. Return a JSON object with "verdict" (approve/reject/request-changes), "score" (0-100), and "output" (detailed feedback).',
    'approval': 'You are a final approver. Review the completed work and provide a recommendation. Return a JSON object with "recommendation" (approve/reject) and "summary".'
  };
  
  let prompt = basePrompts[stage] || 'You are an AI assistant. Process the given task.';
  
  if (instructions) {
    prompt += '\\n\\n## Stage Instructions:\\n' + instructions;
  }
  
  return prompt;
}

function buildUserPrompt(task, stage, instructions) {
  let prompt = '## Task Information\\n';
  prompt += 'Title: ' + task.title + '\\n';
  prompt += 'Description: ' + (task.description || 'No description provided') + '\\n';
  
  if (task.workingContext) {
    prompt += '\\n## Working Context:\\n' + task.workingContext + '\\n';
  }
  
  // For select stage, include the project path so AI knows where to search
  if (stage === 'select' && task.projectPath) {
    prompt += '\\n## Project Root Path:\\n' + task.projectPath + '\\n';
    prompt += '\\nIMPORTANT: Use this path with list_directory and grep_search tools to explore the codebase.\\n';
  }
  
  if (task.assignedFiles && task.assignedFiles.length > 0) {
    prompt += '\\n## Assigned Files:\\n' + task.assignedFiles.join('\\n') + '\\n';
  }
  
  prompt += '\\n## Your Task:\\nProcess this ' + stage + ' stage for the task described above.';
  
  // Add specific instructions for select stage
  if (stage === 'select') {
    prompt += '\\n\\nSTEP 1: Use list_directory to see the project structure.\\n';
    prompt += 'STEP 2: Use grep_search to find files containing relevant terms from the task.\\n';
    prompt += 'STEP 3: Return JSON with selectedFiles array after searching.';
  }
  
  return prompt;
}

function parseStageResult(stage, content, task) {
  // Try to parse JSON responses for structured stages
  if (['distribute', 'select', 'review', 'approval'].includes(stage)) {
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // If JSON parsing fails, return as text
    }
  }
  
  // For work and other stages, return the raw content
  return { response: content, content: content };
}
`;

// Create a blob URL for the worker
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

export interface WorkerInstance {
  id: string;
  name: string;
  worker: Worker;
  status: 'idle' | 'busy' | 'error' | 'shutdown';
  currentTaskId: string | null;
}

export interface WorkerPoolCallbacks {
  onLockRequest: (workerId: string, taskId: string, filePath: string, requestId: string) => void;
  onLockRelease: (workerId: string, filePath: string, taskId?: string) => void;
  onTaskComplete: (workerId: string, taskId: string, stage: Stage, result: unknown) => void;
  onTaskFailed: (workerId: string, taskId: string, stage: Stage, error: string) => void;
  onTaskWaiting: (workerId: string, taskId: string, filePath: string, queuePosition: number) => void;
  onLogEntry: (
    workerId: string,
    taskId: string,
    stage: Stage,
    entryType: string,
    content: string,
    options?: Record<string, unknown>
  ) => void;
}

export class WorkerPool {
  private workers: Map<string, WorkerInstance> = new Map();
  private callbacks: WorkerPoolCallbacks;
  private workerCount: number;

  constructor(workerCount: number, callbacks: WorkerPoolCallbacks) {
    if (workerCount < 1) {
      throw new Error('Worker count must be >= 1');
    }
    this.workerCount = workerCount;
    this.callbacks = callbacks;
  }

  async initialize(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.workerCount; i++) {
      promises.push(this.spawnWorker());
    }

    await Promise.all(promises);
  }

  /**
   * Dynamically resize the worker pool.
   * - If newCount > current: spawn new workers
   * - If newCount < current: gracefully stop idle workers first, mark busy workers for termination
   */
  async resizePool(newCount: number): Promise<void> {
    if (newCount < 1) {
      throw new Error('Worker count must be >= 1');
    }

    const currentCount = this.workers.size;
    const oldWorkerCount = this.workerCount;
    this.workerCount = newCount;

    console.log(`[WorkerPool] Resizing pool from ${currentCount} to ${newCount} workers`);

    if (newCount > currentCount) {
      // Need to spawn more workers
      const toSpawn = newCount - currentCount;
      const promises: Promise<void>[] = [];
      for (let i = 0; i < toSpawn; i++) {
        promises.push(this.spawnWorker());
      }
      await Promise.all(promises);
      console.log(`[WorkerPool] Spawned ${toSpawn} new workers`);
    } else if (newCount < currentCount) {
      // Need to reduce workers - stop idle ones first
      const toRemove = currentCount - newCount;
      let removed = 0;

      // First pass: remove idle workers
      for (const [id, instance] of this.workers) {
        if (removed >= toRemove) break;
        if (instance.status === 'idle') {
          instance.worker.postMessage({ type: 'SHUTDOWN' });
          instance.status = 'shutdown';
          this.workers.delete(id);
          removed++;
          console.log(`[WorkerPool] Removed idle worker ${instance.name}`);
        }
      }

      // If we still need to remove more, mark busy workers for removal when they finish
      if (removed < toRemove) {
        const remainingToRemove = toRemove - removed;
        let marked = 0;
        for (const [, instance] of this.workers) {
          if (marked >= remainingToRemove) break;
          if (instance.status === 'busy') {
            // Mark for termination after current task completes
            (instance as WorkerInstance & { pendingShutdown?: boolean }).pendingShutdown = true;
            marked++;
            console.log(`[WorkerPool] Marked busy worker ${instance.name} for shutdown after task completion`);
          }
        }
      }

      console.log(`[WorkerPool] Removed ${removed} workers immediately, pool now has ${this.workers.size} workers (target: ${newCount})`);
    }

    console.log(`[WorkerPool] Pool resize complete: ${oldWorkerCount} -> ${this.workerCount} (actual: ${this.workers.size})`);
  }

  getTargetWorkerCount(): number {
    return this.workerCount;
  }

  private async spawnWorker(): Promise<void> {
    const id = crypto.randomUUID();
    const name = `Worker-${id.slice(0, 8)}`;
    const worker = new Worker(workerUrl);

    const instance: WorkerInstance = {
      id,
      name,
      worker,
      status: 'idle',
      currentTaskId: null
    };

    // Set up message handler
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      this.handleWorkerMessage(id, e.data);
    };

    worker.onerror = (e) => {
      console.error(`Worker ${name} error:`, e);
      const inst = this.workers.get(id);
      if (inst) {
        const currentTaskId = inst.currentTaskId;
        const currentStage = 'work'; // Default to work, we don't know the actual stage
        
        inst.status = 'error';
        inst.currentTaskId = null;
        
        // Release any locks held by this worker
        this.callbacks.onLockRelease(id, '*'); // Special case to release all
        
        // Report task failure so it gets moved to stopped stage
        if (currentTaskId) {
          this.callbacks.onTaskFailed(
            id,
            currentTaskId,
            currentStage,
            `Worker crashed: ${e.message || 'Unknown error'}`
          );
        }
      }
    };

    this.workers.set(id, instance);

    // Initialize the worker
    return new Promise<void>((resolve) => {
      const initHandler = (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === 'INIT' && e.data.workerId === id) {
          worker.removeEventListener('message', initHandler);
          resolve();
        }
      };
      worker.addEventListener('message', initHandler);
      worker.postMessage({ type: 'INIT', workerId: id, workerName: name });
    });
  }

  private handleWorkerMessage(workerId: string, message: WorkerMessage): void {
    const instance = this.workers.get(workerId);
    if (!instance) return;

    switch (message.type) {
      case 'AI_REQUEST':
        this.handleAIRequest(workerId, message);
        break;

      case 'LOCK_REQUEST':
        this.callbacks.onLockRequest(
          workerId,
          message.taskId!,
          message.filePath!,
          message.requestId!
        );
        break;

      case 'LOCK_RELEASE':
        this.callbacks.onLockRelease(workerId, message.filePath!, instance.currentTaskId || undefined);
        break;

      case 'TASK_COMPLETE':
        instance.status = 'idle';
        instance.currentTaskId = null;
        const completeData = message.data as { stage: Stage; result: unknown };
        this.callbacks.onTaskComplete(
          workerId,
          message.taskId!,
          completeData?.stage || 'work',
          completeData?.result
        );
        // Check if this worker was marked for shutdown during resize
        if ((instance as WorkerInstance & { pendingShutdown?: boolean }).pendingShutdown) {
          console.log(`[WorkerPool] Shutting down worker ${instance.name} after task completion (pool resize)`);
          instance.worker.postMessage({ type: 'SHUTDOWN' });
          instance.status = 'shutdown';
          this.workers.delete(workerId);
        }
        break;

      case 'TASK_FAILED':
        instance.status = 'idle';
        instance.currentTaskId = null;
        const failedData = message.data as { stage: Stage };
        this.callbacks.onTaskFailed(
          workerId,
          message.taskId!,
          failedData?.stage || 'work',
          message.error || 'Unknown error'
        );
        // Check if this worker was marked for shutdown during resize
        if ((instance as WorkerInstance & { pendingShutdown?: boolean }).pendingShutdown) {
          console.log(`[WorkerPool] Shutting down worker ${instance.name} after task failure (pool resize)`);
          instance.worker.postMessage({ type: 'SHUTDOWN' });
          instance.status = 'shutdown';
          this.workers.delete(workerId);
        }
        break;

      case 'TASK_WAITING':
        this.callbacks.onTaskWaiting(
          workerId,
          message.taskId!,
          message.filePath!,
          message.queuePosition || 0
        );
        break;

      case 'LOG_ENTRY':
        // Properties are sent directly on message, not in message.data
        this.callbacks.onLogEntry(
          workerId,
          message.taskId!,
          message.stage || 'work',
          message.entryType || 'action',
          message.content || '',
          message.options
        );
        break;
    }
  }

  assignTask(task: Task, stage: Stage, instructions: string): string | null {
    // Find an idle worker
    for (const [id, instance] of this.workers) {
      if (instance.status === 'idle') {
        instance.status = 'busy';
        instance.currentTaskId = task.id;

        // Enhance task with project path for the select stage
        let enhancedTask = task;
        if (task.projectId) {
          const project = useProjectStore.getState().getProject(task.projectId);
          if (project) {
            enhancedTask = { ...task, projectPath: project.path };
          }
        }

        instance.worker.postMessage({
          type: 'PROCESS_TASK',
          task: enhancedTask,
          stage,
          instructions
        });

        return id;
      }
    }

    return null; // No available workers
  }

  private async handleAIRequest(workerId: string, message: WorkerMessage): Promise<void> {
    const instance = this.workers.get(workerId);
    if (!instance) return;

    const { requestId, stage, systemPrompt, userPrompt } = message as {
      requestId: string;
      stage: Stage;
      systemPrompt: string;
      userPrompt: string;
    };

    try {
      // Get the AI client for this stage
      const client = getOrCreateStageClient(stage);
      
      // Fetch available MCP tools from backend
      const tools = await this.fetchMCPTools();
      
      // Create tool executor that calls the backend
      const toolExecutor = async (toolName: string, input: unknown): Promise<ToolResult> => {
        // Variables for file lock management - declared at top level for catch block access
        const inputObjForLock = input as { path?: string; content?: string };
        let lockAcquired = false;
        
        try {
          // List of tools that access the filesystem
          const pathBasedTools = [
            'read_file', 'write_file', 'append_file', 'delete_file',
            'list_directory', 'create_directory', 'move_file', 'copy_file',
            'search_files', 'search_in_file', 'replace_in_file', 'insert_at_line',
            'file_exists', 'get_file_info', 'grep_search'
          ];
          
          // Validate path access if this is a path-based tool
          if (pathBasedTools.includes(toolName) && instance.currentTaskId) {
            const inputObj = input as Record<string, unknown>;
            const pathFields = ['path', 'sourcePath', 'destinationPath', 'directory'];
            
            for (const field of pathFields) {
              if (field in inputObj && typeof inputObj[field] === 'string') {
                const validation = validatePathForTask(inputObj[field] as string, instance.currentTaskId);
                
                if (!validation.allowed) {
                  // Log sandbox violation
                  this.callbacks.onLogEntry(
                    workerId,
                    instance.currentTaskId,
                    stage,
                    'action',
                    `Tool ${toolName}: BLOCKED - ${validation.reason}`,
                    { tool: toolName, input, sandboxViolation: true, reason: validation.reason }
                  );
                  
                  return {
                    success: false,
                    error: `Access denied: ${validation.reason}`,
                    sandboxViolation: true
                  };
                }
              }
            }
          }
          
          // Helper function to get file snapshot before modification
          const getFileSnapshot = async (filePath: string): Promise<string | undefined> => {
            try {
              const snapshotResponse = await fetch('/api/file/snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath })
              });
              const snapshotResult = await snapshotResponse.json();
              if (snapshotResult.success && snapshotResult.exists) {
                return snapshotResult.content;
              }
              return undefined;
            } catch {
              return undefined;
            }
          };
          
          // For write operations, get the file snapshot BEFORE making changes
          const writeTools = ['write_file', 'append_file', 'replace_in_file', 'insert_at_line', 'delete_file'];
          let contentBefore: string | undefined;
          
          if (writeTools.includes(toolName) && inputObjForLock.path && instance.currentTaskId) {
            contentBefore = await getFileSnapshot(inputObjForLock.path);
            
            // Acquire file lock before write operations
            try {
              const lockStore = useFileLockStore.getState();
              await lockStore.requestLock(
                workerId,
                instance.name,
                instance.currentTaskId,
                inputObjForLock.path
              );
              lockAcquired = true;
              
              // Log lock acquisition
              this.callbacks.onLogEntry(
                workerId,
                instance.currentTaskId,
                stage,
                'lock_acquired',
                `Lock acquired for ${inputObjForLock.path}`,
                { lockEvent: 'acquired', filePath: inputObjForLock.path }
              );
            } catch (lockError) {
              const lockErrorMsg = lockError instanceof Error ? lockError.message : 'Lock acquisition failed';
              this.callbacks.onLogEntry(
                workerId,
                instance.currentTaskId,
                stage,
                'lock_denied',
                `Lock denied for ${inputObjForLock.path}: ${lockErrorMsg}`,
                { lockEvent: 'failed', filePath: inputObjForLock.path, error: lockErrorMsg }
              );
              return {
                success: false,
                error: `Failed to acquire file lock: ${lockErrorMsg}`
              };
            }
          }
          
          // Get task sandbox settings for backend validation
          let allowedPath: string | undefined;
          let allowExternal = true;
          
          if (instance.currentTaskId) {
            const task = useTaskStore.getState().getTask(instance.currentTaskId);
            if (task && task.projectId) {
              const project = useProjectStore.getState().getProject(task.projectId);
              if (project) {
                allowedPath = project.path;
                allowExternal = task.allowExternalAccess;
              }
            }
          }
          
          const response = await fetch('/api/mcp/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              tool: toolName, 
              input,
              // Include sandbox settings for backend validation
              allowedPath,
              allowExternal
            })
          });
          
          const result = await response.json();
          
          // Build a more informative log message that includes key result data
          let logMessage = `Tool ${toolName}: ${result.success ? 'success' : 'failed'}`;
          
          // For successful tool calls, include relevant result data in the log message
          if (result.success && result.data) {
            const data = result.data;
            // Show key result values inline for common tools
            if (toolName === 'get_hostname' && data.hostname) {
              logMessage += ` - hostname: ${data.hostname}`;
            } else if (toolName === 'execute_command' && data.output) {
              const output = data.output.trim();
              const truncated = output.length > 200 ? output.slice(0, 200) + '...' : output;
              logMessage += `\nOutput:\n${truncated}`;
            } else if (toolName === 'get_system_info' && data.hostname) {
              logMessage += ` - ${data.hostname} (${data.platform || 'unknown platform'})`;
            } else if (toolName === 'read_file' && data.content) {
              const lines = data.content.split('\n').length;
              logMessage += ` - ${lines} lines`;
            } else if (toolName === 'list_directory' && data.entries) {
              logMessage += ` - ${data.entries.length} entries`;
            } else if (toolName === 'grep_search' && data.matches) {
              logMessage += ` - ${data.matches.length} matches`;
            } else if (typeof data === 'object' && Object.keys(data).length <= 5) {
              // For simple result objects, show key-value pairs
              const summary = Object.entries(data)
                .filter(([, v]) => typeof v !== 'object' && String(v).length < 100)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
              if (summary) {
                logMessage += ` - ${summary}`;
              }
            }
          } else if (!result.success && result.error) {
            logMessage += ` - ${result.error}`;
          }
          
          // Log tool call and result as single action
          this.callbacks.onLogEntry(
            workerId,
            instance.currentTaskId || '',
            stage,
            'action',
            logMessage,
            { tool: toolName, input, result }
          );
          
          // Track file changes for write/append operations with before/after snapshots
          if (result.success && instance.currentTaskId) {
            if (toolName === 'write_file' && inputObjForLock.path) {
              const isNewFile = contentBefore === undefined;
              useTaskStore.getState().addFileChange(instance.currentTaskId, {
                file: inputObjForLock.path,
                action: isNewFile ? 'created' : 'modified',
                description: `File ${isNewFile ? 'created' : 'written'} via write_file tool`,
                contentBefore: contentBefore,
                contentAfter: inputObjForLock.content,
                diff: generateUnifiedDiff(contentBefore, inputObjForLock.content, inputObjForLock.path)
              });
            } else if (toolName === 'append_file' && inputObjForLock.path) {
              const contentAfter = (contentBefore || '') + (inputObjForLock.content || '');
              useTaskStore.getState().addFileChange(instance.currentTaskId, {
                file: inputObjForLock.path,
                action: contentBefore === undefined ? 'created' : 'modified',
                description: `Content appended via append_file tool`,
                contentBefore: contentBefore,
                contentAfter: contentAfter,
                diff: generateUnifiedDiff(contentBefore, contentAfter, inputObjForLock.path)
              });
            } else if (toolName === 'delete_file' && inputObjForLock.path) {
              useTaskStore.getState().addFileChange(instance.currentTaskId, {
                file: inputObjForLock.path,
                action: 'deleted',
                description: `File deleted via delete_file tool`,
                contentBefore: contentBefore,
                contentAfter: undefined,
                diff: generateUnifiedDiff(contentBefore, undefined, inputObjForLock.path)
              });
            } else if (toolName === 'replace_in_file' && inputObjForLock.path) {
              // Read the file content after replacement to get the new state
              const contentAfter = await getFileSnapshot(inputObjForLock.path);
              const replaceInput = input as { searchPattern?: string };
              useTaskStore.getState().addFileChange(instance.currentTaskId, {
                file: inputObjForLock.path,
                action: 'modified',
                description: `Text replaced via replace_in_file tool${replaceInput.searchPattern ? ` (pattern: ${replaceInput.searchPattern})` : ''}`,
                contentBefore: contentBefore,
                contentAfter: contentAfter,
                diff: generateUnifiedDiff(contentBefore, contentAfter, inputObjForLock.path)
              });
            } else if (toolName === 'insert_at_line' && inputObjForLock.path) {
              // Read the file content after insertion to get the new state
              const contentAfter = await getFileSnapshot(inputObjForLock.path);
              const insertInput = input as { lineNumber?: number };
              useTaskStore.getState().addFileChange(instance.currentTaskId, {
                file: inputObjForLock.path,
                action: 'modified',
                description: `Content inserted${insertInput.lineNumber ? ` at line ${insertInput.lineNumber}` : ''} via insert_at_line tool`,
                contentBefore: contentBefore,
                contentAfter: contentAfter,
                diff: generateUnifiedDiff(contentBefore, contentAfter, inputObjForLock.path)
              });
            }
          }
          
          // Release file lock after write operation
          if (lockAcquired && inputObjForLock.path) {
            useFileLockStore.getState().releaseLock(workerId, inputObjForLock.path);
            this.callbacks.onLogEntry(
              workerId,
              instance.currentTaskId || '',
              stage,
              'lock_released',
              `Lock released for ${inputObjForLock.path}`,
              { lockEvent: 'released', filePath: inputObjForLock.path }
            );
          }
          
          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Tool execution failed';
          
          // Release file lock on error
          if (lockAcquired && inputObjForLock.path) {
            useFileLockStore.getState().releaseLock(workerId, inputObjForLock.path);
            this.callbacks.onLogEntry(
              workerId,
              instance.currentTaskId || '',
              stage,
              'action',
              `Lock released for ${inputObjForLock.path} (after error)`,
              { lockEvent: 'released', filePath: inputObjForLock.path }
            );
          }
          
          // Log failed tool call
          this.callbacks.onLogEntry(
            workerId,
            instance.currentTaskId || '',
            stage,
            'action',
            `Tool ${toolName}: error - ${errorMsg}`,
            { tool: toolName, input, error: errorMsg }
          );
          
          return { success: false, error: errorMsg };
        }
      };
      
      // Enhance system prompt with tool instructions if tools are available
      let enhancedSystemPrompt = systemPrompt;
      if (tools.length > 0) {
        enhancedSystemPrompt += `\n\n## Available MCP Tools\nYou have access to the following tools that can be used to interact with the system. USE THESE TOOLS to execute commands rather than just describing what you would do.\n\nTools:\n${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`;
      }
      
      // Build messages and call AI with tools
      const messages = buildMessages(enhancedSystemPrompt, userPrompt);
      
      // Save last AI request for debugging
      if (instance.currentTaskId) {
        const estimatedTokens = enhancedSystemPrompt.length / 4 + userPrompt.length / 4; // Rough estimate
        useTaskStore.getState().setLastAIRequest(instance.currentTaskId, {
          timestamp: new Date().toISOString(),
          stage,
          systemPrompt: enhancedSystemPrompt,
          userPrompt,
          tools: tools.map(t => t.name),
          totalTokensEstimate: Math.round(estimatedTokens)
        });
      }
      
      const response = await client.chat(messages, tools, toolExecutor);

      // Save last AI response for debugging
      if (instance.currentTaskId && response.content) {
        useTaskStore.getState().setLastAIResponse(instance.currentTaskId, response.content);
      }

      // Update last AI request with actual token usage
      if (instance.currentTaskId && response.tokensUsed) {
        const existingRequest = useTaskStore.getState().getTask(instance.currentTaskId)?.lastAIRequest;
        if (existingRequest) {
          useTaskStore.getState().setLastAIRequest(instance.currentTaskId, {
            ...existingRequest,
            actualInputTokens: response.tokensUsed.prompt,
            actualOutputTokens: response.tokensUsed.completion
          });
        }
      }

      // Track cost for this AI call
      if (instance.currentTaskId && response.tokensUsed) {
        // Approximate cost calculation (Claude Sonnet pricing as default)
        // Input: $3/1M tokens, Output: $15/1M tokens
        const inputCost = (response.tokensUsed.prompt / 1000000) * 3;
        const outputCost = (response.tokensUsed.completion / 1000000) * 15;
        const totalCost = inputCost + outputCost;
        
        useTaskStore.getState().addCost(
          instance.currentTaskId,
          response.tokensUsed.prompt,
          response.tokensUsed.completion,
          totalCost
        );
      }

      // Send response back to worker
      instance.worker.postMessage({
        type: 'AI_RESPONSE',
        requestId,
        result: response
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI request failed';
      
      // Update last AI request with error
      if (instance.currentTaskId) {
        const existingRequest = useTaskStore.getState().getTask(instance.currentTaskId)?.lastAIRequest;
        if (existingRequest) {
          useTaskStore.getState().setLastAIRequest(instance.currentTaskId, {
            ...existingRequest,
            error: errorMessage
          });
        }
      }
      
      // Send error back to worker
      instance.worker.postMessage({
        type: 'AI_RESPONSE',
        requestId,
        error: errorMessage
      });
    }
  }

  private async fetchMCPTools(): Promise<MCPToolDefinition[]> {
    try {
      const response = await fetch('/api/mcp/tools');
      if (response.ok) {
        const data = await response.json();
        return data.tools || [];
      }
    } catch (error) {
      console.warn('[WorkerPool] Failed to fetch MCP tools:', error);
    }
    return [];
  }

  grantLock(workerId: string, requestId: string): void {
    const instance = this.workers.get(workerId);
    if (instance) {
      instance.worker.postMessage({
        type: 'LOCK_GRANTED',
        requestId
      });
    }
  }

  denyLock(workerId: string, requestId: string, reason: string): void {
    const instance = this.workers.get(workerId);
    if (instance) {
      instance.worker.postMessage({
        type: 'LOCK_DENIED',
        requestId,
        reason
      });
    }
  }

  queueLock(workerId: string, taskId: string, filePath: string, position: number): void {
    const instance = this.workers.get(workerId);
    if (instance) {
      instance.worker.postMessage({
        type: 'LOCK_QUEUED',
        taskId,
        filePath,
        position
      });
    }
  }

  getIdleWorkerCount(): number {
    let count = 0;
    for (const instance of this.workers.values()) {
      if (instance.status === 'idle') {
        count++;
      }
    }
    return count;
  }

  getBusyWorkerCount(): number {
    let count = 0;
    for (const instance of this.workers.values()) {
      if (instance.status === 'busy') {
        count++;
      }
    }
    return count;
  }

  getAllWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  shutdown(): void {
    for (const instance of this.workers.values()) {
      instance.worker.postMessage({ type: 'SHUTDOWN' });
      instance.status = 'shutdown';
    }
    this.workers.clear();
  }
}
