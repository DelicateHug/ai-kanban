import React, { useMemo } from 'react';
import { useFileLockStore, formatLockDuration } from '../core/FileLockManager';

export const FileLockPanel: React.FC = () => {
  const locksMap = useFileLockStore((state) => state.locks);
  const waitQueueMap = useFileLockStore((state) => state.waitQueue);

  const locks = useMemo(() => Array.from(locksMap.values()), [locksMap]);
  const queuedRequests = useMemo(() => {
    const result: { filePath: string; requests: { requestId: string; workerId: string; taskId: string; filePath: string; queuedAt: number }[] }[] = [];
    waitQueueMap.forEach((requests, filePath) => {
      result.push({ filePath, requests });
    });
    return result;
  }, [waitQueueMap]);

  const totalLocks = locks.length;
  const totalQueued = queuedRequests.reduce((sum, q) => sum + q.requests.length, 0);

  return (
    <div 
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-primary flex items-center gap-2">
          <span>🔒</span>
          File Locks
        </h3>
        <div className="flex gap-2 text-sm">
          <span className="badge badge-danger">
            {totalLocks} locked
          </span>
          <span className="badge badge-warning">
            {totalQueued} waiting
          </span>
        </div>
      </div>

      {totalLocks === 0 && totalQueued === 0 ? (
        <div className="text-center py-6 text-muted text-sm">
          <div className="text-2xl mb-2 opacity-50">🔓</div>
          No active file locks
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {/* Active Locks */}
          {locks.map((lock) => {
            const queueForFile = queuedRequests.find(q => q.filePath === lock.filePath);
            const waitingCount = queueForFile?.requests.length || 0;

            return (
              <div
                key={lock.filePath}
                className="p-3 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-primary truncate">
                      📄 {lock.filePath}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                      <span className="badge badge-info">
                        {lock.workerName}
                      </span>
                      <span>•</span>
                      <span>{formatLockDuration(lock.acquiredAt)}</span>
                    </div>
                  </div>
                  {waitingCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-warning">
                      <span className="animate-pulse">⏳</span>
                      <span>{waitingCount} waiting</span>
                    </div>
                  )}
                </div>

                {/* Waiting Queue */}
                {queueForFile && queueForFile.requests.length > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                    <div className="text-xs text-muted mb-1">Queue:</div>
                    <div className="flex flex-wrap gap-1">
                      {queueForFile.requests.map((req, index) => (
                        <span
                          key={req.requestId}
                          className="badge badge-warning"
                        >
                          #{index + 1} Worker-{req.workerId.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
