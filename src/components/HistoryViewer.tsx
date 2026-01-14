import React, { useState, useEffect } from 'react';
import type { HistoryEntry, HistoryEntryType } from '../core/types';
import { getHistoryPage } from '../core/HistoryManager';
import { SimpleMarkdown } from './MarkdownRenderer';

interface HistoryViewerProps {
  taskId: string;
  pageSize?: number;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({
  taskId,
  pageSize = 50
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    loadPage(currentPage);
  }, [taskId, currentPage, pageSize]);

  const loadPage = (page: number) => {
    const result = getHistoryPage(taskId, page, pageSize);
    setEntries(result.entries);
    setTotalPages(result.totalPages);
    setTotalEntries(result.totalEntries);
    setCurrentPage(result.currentPage);
    setPageInput(result.currentPage.toString());
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getEntryIcon = (type: HistoryEntryType): string => {
    const icons: Record<HistoryEntryType, string> = {
      action: '⚡',
      thought: '💭',
      file_change: '📄',
      stage_change: '➡️',
      ai_response: '🤖',
      error: '❌',
      human_input: '👤',
      lock_acquired: '🔒',
      lock_released: '🔓',
      lock_queued: '⏳',
      lock_denied: '🚫',
      summarization: '📝'
    };
    return icons[type] || '•';
  };

  const getEntryColorClass = (type: HistoryEntryType): string => {
    const colors: Record<HistoryEntryType, string> = {
      action: 'var(--info)',
      thought: 'var(--purple)',
      file_change: 'var(--success)',
      stage_change: 'var(--accent-orange)',
      ai_response: 'var(--accent-primary)',
      error: 'var(--danger)',
      human_input: 'var(--warning)',
      lock_acquired: 'var(--text-muted)',
      lock_released: 'var(--text-muted)',
      lock_queued: 'var(--warning)',
      lock_denied: 'var(--danger)',
      summarization: 'var(--purple)'
    };
    return colors[type] || 'var(--border-secondary)';
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Generate page numbers to display
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('ellipsis');
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  if (totalEntries === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <div className="text-3xl mb-2 opacity-50">📋</div>
        <p>No history entries yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{totalEntries} total entries</span>
        <span>Page {currentPage} of {totalPages}</span>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-3 rounded-lg"
            style={{ 
              background: 'var(--bg-elevated)', 
              borderLeft: `4px solid ${getEntryColorClass(entry.type)}`
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg">{getEntryIcon(entry.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-medium text-muted uppercase">
                    {entry.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted">•</span>
                  <span className="text-xs text-muted">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className="text-xs text-muted">•</span>
                  <span className={`badge stage-${entry.stage}`}>
                    {entry.stage}
                  </span>
                </div>
                <div className="text-sm text-primary">
                  <SimpleMarkdown content={entry.content} />
                </div>
                {entry.file && (
                  <div className="mt-2 text-xs font-mono text-muted">
                    📄 {entry.file}
                  </div>
                )}
                {entry.diff && (
                  <pre 
                    className="mt-2 p-2 text-xs rounded overflow-x-auto"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                  >
                    {entry.diff}
                  </pre>
                )}
                {entry.tokens && (
                  <div className="mt-1 text-xs text-muted">
                    🎫 Tokens: {entry.tokens.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4" style={{ borderTop: '1px solid var(--border-secondary)' }}>
          {/* Previous button */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className={`btn btn-sm ${currentPage === 1 ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-secondary'}`}
          >
            ← Prev
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-8 h-8 text-sm rounded transition-colors ${
                    currentPage === page
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }`}
                  style={currentPage === page ? { background: 'var(--accent-primary)', color: 'var(--bg-primary)' } : { background: 'var(--bg-elevated)' }}
                >
                  {page}
                </button>
              )
            )}
          </div>

          {/* Next button */}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`btn btn-sm ${currentPage === totalPages ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-secondary'}`}
          >
            Next →
          </button>

          {/* Direct page input */}
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2 ml-4">
            <span className="text-sm text-muted">Go to:</span>
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              className="w-16 px-2 py-1 text-sm rounded text-center"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
            />
          </form>
        </div>
      )}
    </div>
  );
};
