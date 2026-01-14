import type { Task, Stage } from './types';
import { getSummarizeThreshold, getStageConfig } from './config';
import { appendHistoryEntry } from './HistoryManager';

// Simple token estimation: ~4 characters per token (rough approximation)
// In production, use tiktoken or API-specific tokenizers
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Build context string from task for AI consumption
export function buildTaskContext(task: Task): string {
  const parts: string[] = [
    `# Task: ${task.title}`,
    '',
    `## Description`,
    task.description,
    '',
    `## Current Stage: ${task.currentStage}`,
    `## Status: ${task.status}`,
    `## Turn Count: ${task.turnCount}`,
    ''
  ];

  if (task.workingContext) {
    parts.push('## Working Context');
    parts.push(task.workingContext);
    parts.push('');
  }

  if (task.assignedFiles.length > 0) {
    parts.push('## Assigned Files');
    task.assignedFiles.forEach(f => parts.push(`- ${f}`));
    parts.push('');
  }

  if (task.changedFiles.length > 0) {
    parts.push('## Changed Files');
    task.changedFiles.forEach(f => {
      parts.push(`- ${f.file} (${f.action}): ${f.description}`);
    });
    parts.push('');
  }

  if (task.reviews.length > 0) {
    parts.push('## Reviews');
    task.reviews.forEach(r => {
      parts.push(`### ${r.reviewerId}`);
      parts.push(`Verdict: ${r.verdict} (Score: ${r.score})`);
      parts.push(r.output);
      parts.push('');
    });
  }

  if (task.reviewSynthesis) {
    parts.push('## Review Synthesis');
    parts.push(task.reviewSynthesis);
    parts.push('');
  }

  return parts.join('\n');
}

// Check if task context exceeds threshold for current stage
export function checkContextUsage(
  task: Task,
  stage?: Stage
): { 
  usage: number; 
  threshold: number; 
  needsSummarization: boolean;
  currentTokens: number;
  maxTokens: number;
} {
  const targetStage = stage || task.currentStage;
  const stageConfig = getStageConfig(targetStage);
  
  if (!stageConfig) {
    return {
      usage: 0,
      threshold: getSummarizeThreshold(),
      needsSummarization: false,
      currentTokens: 0,
      maxTokens: 200000 // Default fallback
    };
  }

  const context = buildTaskContext(task);
  const currentTokens = estimateTokens(context);
  const maxTokens = stageConfig.maxContextTokens;
  const threshold = getSummarizeThreshold();
  const usage = currentTokens / maxTokens;

  return {
    usage,
    threshold,
    needsSummarization: usage >= threshold,
    currentTokens,
    maxTokens
  };
}

// Determine if task should be routed to summarize stage
export function shouldSummarize(task: Task, targetStage: Stage): boolean {
  // Don't check if already in summarize stage or if going to non-AI stages
  if (targetStage === 'summarize' || 
      targetStage === 'backlog' || 
      targetStage === 'stopped' ||
      targetStage === 'continue' ||
      targetStage === 'complete') {
    return false;
  }

  const { needsSummarization } = checkContextUsage(task, targetStage);
  return needsSummarization;
}

// Update task with summarized context
export function applySummarization(
  task: Task,
  summarizedContext: string,
  originalTokens: number
): Task {
  const newTokens = estimateTokens(summarizedContext);
  
  // Log the summarization
  appendHistoryEntry(
    task.id,
    'summarization',
    'summarize',
    `Context summarized: ${originalTokens} tokens → ${newTokens} tokens (${Math.round((1 - newTokens/originalTokens) * 100)}% reduction)`,
    {
      tokens: newTokens,
      metadata: {
        originalTokens,
        newTokens,
        reduction: originalTokens - newTokens
      }
    }
  );

  return {
    ...task,
    workingContext: summarizedContext,
    contextSummarized: true,
    currentTokens: newTokens,
    updatedAt: new Date().toISOString()
  };
}

// Get context usage percentage as a display value
export function getContextUsagePercent(task: Task, stage?: Stage): number {
  const { usage } = checkContextUsage(task, stage);
  return Math.round(usage * 100);
}

// Get context status for UI display
export function getContextStatus(task: Task, stage?: Stage): {
  percent: number;
  status: 'safe' | 'warning' | 'critical';
  message: string;
} {
  const { usage, threshold, currentTokens, maxTokens } = checkContextUsage(task, stage);
  const percent = Math.round(usage * 100);
  
  let status: 'safe' | 'warning' | 'critical';
  let message: string;
  
  if (usage < threshold * 0.75) {
    status = 'safe';
    message = `${currentTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens`;
  } else if (usage < threshold) {
    status = 'warning';
    message = `Approaching threshold: ${percent}% of ${Math.round(threshold * 100)}%`;
  } else {
    status = 'critical';
    message = `Exceeds threshold: will be summarized`;
  }

  return { percent, status, message };
}
