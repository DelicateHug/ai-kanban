import { v4 as uuidv4 } from 'uuid';
import type { 
  HistoryEntry, 
  HistoryFile, 
  HistoryIndex, 
  HistoryEntryType, 
  Stage 
} from './types';
import { getMaxHistoryFileSize, getEntriesPerPage } from './config';

// In-memory storage (in a real app, this would be file system or IndexedDB)
const historyStorage = new Map<string, HistoryIndex>();
const historyFiles = new Map<string, HistoryFile>();

function getHistoryIndexKey(taskId: string): string {
  return `history-index-${taskId}`;
}

function getHistoryFileKey(taskId: string, fileNumber: number): string {
  return `history-${taskId}-${fileNumber}`;
}

export function initializeHistory(taskId: string): HistoryIndex {
  const index: HistoryIndex = {
    taskId,
    totalEntries: 0,
    files: ['history-1.json'],
    entriesPerFile: [0],
    lastUpdated: new Date().toISOString()
  };
  
  historyStorage.set(getHistoryIndexKey(taskId), index);
  
  const firstFile: HistoryFile = {
    taskId,
    fileNumber: 1,
    entries: []
  };
  historyFiles.set(getHistoryFileKey(taskId, 1), firstFile);
  
  return index;
}

export function getHistoryIndex(taskId: string): HistoryIndex | null {
  return historyStorage.get(getHistoryIndexKey(taskId)) || null;
}

export function appendHistoryEntry(
  taskId: string,
  type: HistoryEntryType,
  stage: Stage,
  content: string,
  options?: {
    file?: string;
    diff?: string;
    tokens?: number;
    metadata?: Record<string, unknown>;
  }
): HistoryEntry {
  let index = getHistoryIndex(taskId);
  if (!index) {
    index = initializeHistory(taskId);
  }

  const entry: HistoryEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    stage,
    type,
    content,
    ...options
  };

  // Get current file
  const currentFileNumber = index.files.length;
  const fileKey = getHistoryFileKey(taskId, currentFileNumber);
  let currentFile = historyFiles.get(fileKey);
  
  if (!currentFile) {
    currentFile = {
      taskId,
      fileNumber: currentFileNumber,
      entries: []
    };
    historyFiles.set(fileKey, currentFile);
  }

  // Check file size - estimate by stringifying
  const estimatedSize = JSON.stringify(currentFile).length + JSON.stringify(entry).length;
  const maxSize = getMaxHistoryFileSize();

  if (estimatedSize > maxSize && currentFile.entries.length > 0) {
    // Create new file
    const newFileNumber = currentFileNumber + 1;
    const newFileName = `history-${newFileNumber}.json`;
    
    index.files.push(newFileName);
    index.entriesPerFile.push(0);
    
    const newFile: HistoryFile = {
      taskId,
      fileNumber: newFileNumber,
      entries: [entry]
    };
    historyFiles.set(getHistoryFileKey(taskId, newFileNumber), newFile);
    index.entriesPerFile[newFileNumber - 1] = 1;
  } else {
    // Add to current file
    currentFile.entries.push(entry);
    index.entriesPerFile[currentFileNumber - 1] = currentFile.entries.length;
  }

  index.totalEntries++;
  index.lastUpdated = new Date().toISOString();
  historyStorage.set(getHistoryIndexKey(taskId), index);

  return entry;
}

export function getHistoryPage(
  taskId: string,
  page: number,
  pageSize?: number
): { entries: HistoryEntry[]; totalPages: number; totalEntries: number; currentPage: number } {
  const index = getHistoryIndex(taskId);
  if (!index) {
    return { entries: [], totalPages: 0, totalEntries: 0, currentPage: 1 };
  }

  const entriesPerPage = pageSize || getEntriesPerPage();
  const totalPages = Math.ceil(index.totalEntries / entriesPerPage);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  
  // Collect all entries (in real implementation, this would read from files)
  const allEntries: HistoryEntry[] = [];
  for (let i = 1; i <= index.files.length; i++) {
    const file = historyFiles.get(getHistoryFileKey(taskId, i));
    if (file) {
      allEntries.push(...file.entries);
    }
  }

  // Calculate slice
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const entries = allEntries.slice(startIndex, endIndex);

  return {
    entries,
    totalPages,
    totalEntries: index.totalEntries,
    currentPage
  };
}

export function getAllHistory(taskId: string): HistoryEntry[] {
  const index = getHistoryIndex(taskId);
  if (!index) {
    return [];
  }

  const allEntries: HistoryEntry[] = [];
  for (let i = 1; i <= index.files.length; i++) {
    const file = historyFiles.get(getHistoryFileKey(taskId, i));
    if (file) {
      allEntries.push(...file.entries);
    }
  }

  return allEntries;
}

export function getHistoryStats(taskId: string): {
  totalEntries: number;
  totalFiles: number;
  entriesByType: Record<HistoryEntryType, number>;
  entriesByStage: Record<Stage, number>;
} | null {
  const index = getHistoryIndex(taskId);
  if (!index) {
    return null;
  }

  const allEntries = getAllHistory(taskId);
  
  const entriesByType: Partial<Record<HistoryEntryType, number>> = {};
  const entriesByStage: Partial<Record<Stage, number>> = {};

  for (const entry of allEntries) {
    entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
    entriesByStage[entry.stage] = (entriesByStage[entry.stage] || 0) + 1;
  }

  return {
    totalEntries: index.totalEntries,
    totalFiles: index.files.length,
    entriesByType: entriesByType as Record<HistoryEntryType, number>,
    entriesByStage: entriesByStage as Record<Stage, number>
  };
}

// Export history as JSON for download
export function exportHistory(taskId: string): string {
  const allEntries = getAllHistory(taskId);
  const index = getHistoryIndex(taskId);
  
  return JSON.stringify({
    taskId,
    exportedAt: new Date().toISOString(),
    index,
    entries: allEntries
  }, null, 2);
}
