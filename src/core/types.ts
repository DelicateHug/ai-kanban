// Task stages in order of execution
export const STAGES = [
  'stopped',
  'continue',
  'backlog',
  'summarize',
  'create',
  'plan',
  'select',
  'distribute',
  'work',
  'review',
  'approval',
  'complete'
] as const;

export type Stage = typeof STAGES[number];

// Project types - each project is a folder with sandboxed tool access
export interface Project {
  id: string;
  name: string;
  description: string;
  path: string;                    // Absolute path to the project folder
  color: string;                   // Color for visual identification
  icon: string;                    // Emoji icon for the project
  createdAt: string;
  updatedAt: string;
  taskCount: number;               // Number of tasks in this project
  activeTaskCount: number;         // Number of non-complete tasks
}

// Project config for settings
export interface ProjectConfig {
  projects: Project[];
  activeProjectId: string | null;  // null means show all projects
}

// Stages that require human input
export const HUMAN_GATE_STAGES: Stage[] = ['continue', 'approval'];

// Stages that can be processed by workers
export const PROCESSABLE_STAGES: Stage[] = [
  'summarize',
  'plan',
  'select',
  'distribute',
  'work',
  'review'
];

// Stage flow: defines the next stage after each stage
// Order: plan -> select -> distribute -> work -> review -> approval -> complete
// Select comes before distribute because you need to know what files/agents are needed before distributing work
// Note: Tasks with skipPlanning=true go directly from create to select
export const STAGE_FLOW: Partial<Record<Stage, Stage>> = {
  'create': 'plan',
  'plan': 'select',
  'select': 'distribute',
  'distribute': 'work',
  'work': 'review',
  'review': 'approval',
  'approval': 'complete'
};

// Note: Tasks with skipDistribute=true skip the distribute stage entirely
// This should be used for simple tasks that don't need to be broken into subtasks

export type TaskStatus = 
  | 'active'
  | 'waiting'
  | 'waiting-timeout'
  | 'blocked-human'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'stopped'
  | 'paused';

export interface Review {
  reviewerId: string;
  instructionFile: string;
  output: string;
  verdict: 'approve' | 'request-changes' | 'reject';
  score: number;
  timestamp: string;
}

export interface PlanningChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface FileChange {
  file: string;
  action: 'created' | 'modified' | 'deleted';
  description: string;
  diff?: string;
  contentBefore?: string;  // Snapshot of file content before the change
  contentAfter?: string;   // Content after the change
  timestamp?: string;      // When the change was recorded
}

export interface Task {
  id: string;
  title: string;
  description: string;
  currentStage: Stage;
  status: TaskStatus;
  turnCount: number;
  workingContext: string;
  assignedFiles: string[];
  changedFiles: FileChange[];
  reviews: Review[];
  reviewSynthesis: string;
  planningChat: PlanningChatMessage[];
  planningApproved: boolean;
  planningFiles: string[];     // Selected planning instruction files for this task
  reviewFiles: string[];       // Selected review instruction files for this task
  allowedMcpServers: string[]; // Allowed MCP servers for this task
  contextSummarized: boolean;
  currentTokens: number;
  createdAt: string;
  updatedAt: string;
  
  // Project association and sandboxing
  projectId?: string;              // Associated project ID (null = global/no project)
  allowExternalAccess: boolean;    // If true, MCP tools can access files outside project folder
  
  // Skip options for simple tasks
  skipPlanning: boolean;       // If true, skip directly to select stage
  skipDistribute: boolean;     // If true, skip distribute stage (no child tasks created)
  skipReview: boolean;         // If true, skip review stage (go directly to approval)
  
  // Cost tracking
  totalCost: number;           // Total cost in USD
  totalInputTokens: number;    // Total input tokens used
  totalOutputTokens: number;   // Total output tokens used
  
  // Final output
  finalOutput: string;         // Final output/summary of the task
  
  // Child task support - tasks are split at distribute phase
  parentId?: string;           // Reference to parent task (if this is a child)
  childIds?: string[];         // References to child tasks (if this is a parent)
  isChildTask?: boolean;       // Flag to identify child tasks
  childIndex?: number;         // Index of this child within parent (for ordering)
  errorMessage?: string;       // Error message if task moved to stopped stage
  previousStatus?: TaskStatus; // Status before pausing (for resume)
  isRead: boolean;             // Whether the task has been read/viewed by user
}

export type HistoryEntryType = 
  | 'action'
  | 'thought'
  | 'file_change'
  | 'stage_change'
  | 'ai_response'
  | 'error'
  | 'human_input'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_queued'
  | 'lock_denied'
  | 'summarization';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  stage: Stage;
  type: HistoryEntryType;
  content: string;
  file?: string;
  diff?: string;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface HistoryIndex {
  taskId: string;
  totalEntries: number;
  files: string[];
  entriesPerFile: number[];
  lastUpdated: string;
}

export interface HistoryFile {
  taskId: string;
  fileNumber: number;
  entries: HistoryEntry[];
}

// Config types
export type AIProvider = 'anthropic' | 'openai';

export interface StageConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  maxContextTokens: number;
}

export interface WorkersConfig {
  count: number;
  lockTimeoutSeconds: number;
  maxTurnCount: number;
}

export interface PlanningConfig {
  autoApprove: boolean;
  defaultPlanningFiles: string[];
}

export interface ReviewConfig {
  defaultReviewFiles: string[];
}

export interface McpConfig {
  defaultServers: string[];
  availableServers: string[];
}

export interface ContextConfig {
  summarizeThresholdPercent: number;
  trackUsage: boolean;
}

export interface HistoryConfig {
  maxFileSizeBytes: number;
  entriesPerPage: number;
}

export interface AutoSaveConfig {
  enabled: boolean;
  intervalSeconds: number;
  filePath: string;
}

export interface AppConfig {
  autoSave: AutoSaveConfig;
  workers: WorkersConfig;
  context: ContextConfig;
  history: HistoryConfig;
  planning: PlanningConfig;
  review: ReviewConfig;
  mcp: McpConfig;
  stages: Record<string, StageConfig>;
}

// File lock types
export interface FileLock {
  filePath: string;
  workerId: string;
  workerName: string;
  taskId: string;
  acquiredAt: number;
}

export interface QueuedLockRequest {
  requestId: string;
  workerId: string;
  taskId: string;
  filePath: string;
  queuedAt: number;
}

// Worker message types
export type WorkerMessageType =
  | 'INIT'
  | 'PROCESS_TASK'
  | 'AI_REQUEST'
  | 'AI_RESPONSE'
  | 'LOCK_REQUEST'
  | 'LOCK_GRANTED'
  | 'LOCK_DENIED'
  | 'LOCK_QUEUED'
  | 'LOCK_RELEASE'
  | 'LOCK_RELEASED'
  | 'TASK_COMPLETE'
  | 'TASK_FAILED'
  | 'TASK_WAITING'
  | 'LOG_ENTRY'
  | 'CONTEXT_CHECK'
  | 'NEEDS_SUMMARIZATION'
  | 'SHUTDOWN';

export interface WorkerMessage {
  type: WorkerMessageType;
  workerId?: string;
  taskId?: string;
  requestId?: string;
  filePath?: string;
  data?: unknown;
  error?: string;
  // Fields sent directly by LOG_ENTRY messages
  stage?: Stage;
  entryType?: string;
  content?: string;
  options?: Record<string, unknown>;
  // Fields for queue position
  queuePosition?: number;
  // Fields for AI requests
  systemPrompt?: string;
  userPrompt?: string;
  result?: unknown;
}

// AI client types
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// MCP Tool types
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  sandboxViolation?: boolean;  // True if the tool was blocked due to path restrictions
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: ToolResult;
}

export interface AIResponse {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  toolCalls?: ToolCall[];
}

// Tool executor function type
export type ToolExecutor = (toolName: string, input: unknown) => Promise<ToolResult>;

export interface AIClient {
  chat(messages: AIMessage[], tools?: MCPToolDefinition[], toolExecutor?: ToolExecutor): Promise<AIResponse>;
  estimateTokens(text: string): number;
}
