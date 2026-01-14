import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { FileLock, QueuedLockRequest } from './types';
import { getLockTimeout } from './config';

interface FileLockState {
  // State
  locks: Map<string, FileLock>;
  waitQueue: Map<string, QueuedLockRequest[]>;
  workerLocks: Map<string, Set<string>>; // workerId -> set of file paths

  // Actions
  requestLock: (
    workerId: string,
    workerName: string,
    taskId: string,
    filePath: string
  ) => Promise<void>;
  releaseLock: (workerId: string, filePath: string) => void;
  releaseAllWorkerLocks: (workerId: string) => void;

  // Selectors
  isFileLocked: (filePath: string) => boolean;
  getLockHolder: (filePath: string) => FileLock | undefined;
  getQueueLength: (filePath: string) => number;
  getWorkerLockCount: (workerId: string) => number;
  getAllLocks: () => FileLock[];
  getAllQueuedRequests: () => { filePath: string; requests: QueuedLockRequest[] }[];
}

// Store pending promise resolvers (outside zustand for proper closure handling)
const pendingResolvers = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void }
>();

export const useFileLockStore = create<FileLockState>()(
  subscribeWithSelector((set, get) => ({
    locks: new Map(),
    waitQueue: new Map(),
    workerLocks: new Map(),

    requestLock: async (
      workerId: string,
      workerName: string,
      taskId: string,
      filePath: string
    ): Promise<void> => {
      const state = get();
      const existingLock = state.locks.get(filePath);

      // If not locked, grant immediately
      if (!existingLock) {
        set((s) => {
          const newLocks = new Map(s.locks);
          newLocks.set(filePath, {
            filePath,
            workerId,
            workerName,
            taskId,
            acquiredAt: Date.now()
          });

          const newWorkerLocks = new Map(s.workerLocks);
          const workerFiles = newWorkerLocks.get(workerId) || new Set();
          workerFiles.add(filePath);
          newWorkerLocks.set(workerId, workerFiles);

          return { locks: newLocks, workerLocks: newWorkerLocks };
        });
        return;
      }

      // If same worker already has it (re-entrant), return immediately
      if (existingLock.workerId === workerId) {
        return;
      }

      // Queue the request
      const requestId = uuidv4();
      const request: QueuedLockRequest = {
        requestId,
        workerId,
        taskId,
        filePath,
        queuedAt: Date.now()
      };

      return new Promise<void>((resolve, reject) => {
        // Store resolvers
        pendingResolvers.set(requestId, { resolve, reject });

        // Add to queue
        set((s) => {
          const newQueue = new Map(s.waitQueue);
          const fileQueue = newQueue.get(filePath) || [];
          fileQueue.push(request);
          newQueue.set(filePath, fileQueue);
          return { waitQueue: newQueue };
        });

        // Set timeout
        const timeout = getLockTimeout();
        setTimeout(() => {
          const resolvers = pendingResolvers.get(requestId);
          if (resolvers) {
            // Remove from queue
            set((s) => {
              const newQueue = new Map(s.waitQueue);
              const fileQueue = newQueue.get(filePath) || [];
              const filteredQueue = fileQueue.filter((r) => r.requestId !== requestId);
              if (filteredQueue.length > 0) {
                newQueue.set(filePath, filteredQueue);
              } else {
                newQueue.delete(filePath);
              }
              return { waitQueue: newQueue };
            });

            pendingResolvers.delete(requestId);
            resolvers.reject(
              new Error(`Lock timeout for ${filePath} after ${timeout}ms`)
            );
          }
        }, timeout);
      });
    },

    releaseLock: (workerId: string, filePath: string): void => {
      const state = get();
      const lock = state.locks.get(filePath);

      // Only owner can release
      if (!lock || lock.workerId !== workerId) {
        return;
      }

      set((s) => {
        const newLocks = new Map(s.locks);
        newLocks.delete(filePath);

        const newWorkerLocks = new Map(s.workerLocks);
        const workerFiles = newWorkerLocks.get(workerId);
        if (workerFiles) {
          workerFiles.delete(filePath);
          if (workerFiles.size === 0) {
            newWorkerLocks.delete(workerId);
          } else {
            newWorkerLocks.set(workerId, workerFiles);
          }
        }

        // Grant to next in queue
        const newQueue = new Map(s.waitQueue);
        const fileQueue = newQueue.get(filePath) || [];

        if (fileQueue.length > 0) {
          const nextRequest = fileQueue.shift()!;

          // Grant lock to next requester
          newLocks.set(filePath, {
            filePath,
            workerId: nextRequest.workerId,
            workerName: `Worker-${nextRequest.workerId.slice(0, 8)}`,
            taskId: nextRequest.taskId,
            acquiredAt: Date.now()
          });

          // Update worker locks for new holder
          const nextWorkerFiles = newWorkerLocks.get(nextRequest.workerId) || new Set();
          nextWorkerFiles.add(filePath);
          newWorkerLocks.set(nextRequest.workerId, nextWorkerFiles);

          // Update queue
          if (fileQueue.length > 0) {
            newQueue.set(filePath, fileQueue);
          } else {
            newQueue.delete(filePath);
          }

          // Resolve the waiting promise
          const resolvers = pendingResolvers.get(nextRequest.requestId);
          if (resolvers) {
            pendingResolvers.delete(nextRequest.requestId);
            resolvers.resolve();
          }
        }

        return { locks: newLocks, workerLocks: newWorkerLocks, waitQueue: newQueue };
      });
    },

    releaseAllWorkerLocks: (workerId: string): void => {
      const state = get();
      const workerFiles = state.workerLocks.get(workerId);

      if (!workerFiles || workerFiles.size === 0) {
        return;
      }

      // Release each lock
      workerFiles.forEach((filePath) => {
        get().releaseLock(workerId, filePath);
      });
    },

    isFileLocked: (filePath: string): boolean => {
      return get().locks.has(filePath);
    },

    getLockHolder: (filePath: string): FileLock | undefined => {
      return get().locks.get(filePath);
    },

    getQueueLength: (filePath: string): number => {
      return get().waitQueue.get(filePath)?.length || 0;
    },

    getWorkerLockCount: (workerId: string): number => {
      return get().workerLocks.get(workerId)?.size || 0;
    },

    getAllLocks: (): FileLock[] => {
      return Array.from(get().locks.values());
    },

    getAllQueuedRequests: (): { filePath: string; requests: QueuedLockRequest[] }[] => {
      const result: { filePath: string; requests: QueuedLockRequest[] }[] = [];
      get().waitQueue.forEach((requests, filePath) => {
        result.push({ filePath, requests });
      });
      return result;
    }
  }))
);

// Helper to format lock duration
export function formatLockDuration(acquiredAt: number): string {
  const seconds = Math.floor((Date.now() - acquiredAt) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
