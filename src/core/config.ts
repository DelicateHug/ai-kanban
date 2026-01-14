import type { AppConfig } from './types';
import defaultConfig from '../../config/settings.json';

let config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!config) {
    config = defaultConfig as AppConfig;
    validateConfig(config);
  }
  return config;
}

export function validateConfig(cfg: AppConfig): void {
  // Validate worker count is >= 1
  if (cfg.workers.count < 1) {
    throw new Error('workers.count must be >= 1. Dynamic worker count (0) is not supported.');
  }

  // Validate lock timeout
  if (cfg.workers.lockTimeoutSeconds < 1) {
    throw new Error('workers.lockTimeoutSeconds must be >= 1');
  }

  // Validate max turn count
  if (cfg.workers.maxTurnCount < 1) {
    throw new Error('workers.maxTurnCount must be >= 1');
  }

  // Validate context threshold
  if (cfg.context.summarizeThresholdPercent < 1 || cfg.context.summarizeThresholdPercent > 100) {
    throw new Error('context.summarizeThresholdPercent must be between 1 and 100');
  }

  // Validate history config
  if (cfg.history.maxFileSizeBytes < 1024) {
    throw new Error('history.maxFileSizeBytes must be at least 1024 bytes');
  }

  // Validate planning config
  if (cfg.planning === undefined || typeof cfg.planning.autoApprove !== 'boolean') {
    throw new Error('planning.autoApprove must be a boolean');
  }

  // Validate review config (optional, will use defaults if not present)
  if (cfg.review && !Array.isArray(cfg.review.defaultReviewFiles)) {
    throw new Error('review.defaultReviewFiles must be an array');
  }

  // Validate each stage config
  const requiredStages = ['create', 'summarize', 'plan', 'distribute', 'select', 'work', 'review', 'approval'];
  for (const stage of requiredStages) {
    const stageConfig = cfg.stages[stage];
    if (!stageConfig) {
      throw new Error(`Missing configuration for stage: ${stage}`);
    }
    if (!['anthropic', 'openai'].includes(stageConfig.provider)) {
      throw new Error(`Invalid provider for stage ${stage}: ${stageConfig.provider}`);
    }
    if (!stageConfig.model) {
      throw new Error(`Missing model for stage: ${stage}`);
    }
    if (!stageConfig.apiKey) {
      throw new Error(`Missing apiKey for stage: ${stage}`);
    }
    if (stageConfig.maxContextTokens < 1000) {
      throw new Error(`maxContextTokens for stage ${stage} must be at least 1000`);
    }
  }
}

export function getStageConfig(stage: string): AppConfig['stages'][string] | undefined {
  return getConfig().stages[stage];
}

export function getWorkerCount(): number {
  return getConfig().workers.count;
}

export function getLockTimeout(): number {
  return getConfig().workers.lockTimeoutSeconds * 1000; // Convert to ms
}

export function getSummarizeThreshold(): number {
  return getConfig().context.summarizeThresholdPercent / 100;
}

export function getMaxHistoryFileSize(): number {
  return getConfig().history.maxFileSizeBytes;
}

export function getEntriesPerPage(): number {
  return getConfig().history.entriesPerPage;
}

export function getMaxTurnCount(): number {
  return getConfig().workers.maxTurnCount;
}

export function getPlanningAutoApprove(): boolean {
  return getConfig().planning.autoApprove;
}

export function getDefaultPlanningFiles(): string[] {
  return getConfig().planning.defaultPlanningFiles || [];
}

export function getDefaultReviewFiles(): string[] {
  return getConfig().review?.defaultReviewFiles || [
    'review/code-review.md',
    'review/architecture-review.md',
    'review/security-review.md'
  ];
}

export function getDefaultMcpServers(): string[] {
  return getConfig().mcp?.defaultServers || [
    'filesystem',
    'terminal'
  ];
}

export function getOtherInstructionsEnabled(): boolean {
  return getConfig().otherInstructions?.enabled ?? true;
}

export function getDefaultOtherInstructionFiles(): string[] {
  return getConfig().otherInstructions?.defaultFiles ?? [];
}

export function getAutoSaveEnabled(): boolean {
  return getConfig().autoSave?.enabled ?? true;
}

export function getAutoSaveInterval(): number {
  return (getConfig().autoSave?.intervalSeconds ?? 10) * 1000; // Convert to ms
}

export function getAutoSaveFilePath(): string {
  return getConfig().autoSave?.filePath || 'data/tasks.json';
}

export function updateConfig(newConfig: Partial<AppConfig>): void {
  const currentConfig = getConfig();
  config = { ...currentConfig, ...newConfig } as AppConfig;
}

export function getFullConfig(): AppConfig {
  return getConfig();
}
