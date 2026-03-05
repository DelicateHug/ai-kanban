/**
 * FolderBrowser - Modal for browsing and selecting folders from the file system
 * Uses the backend /api/browse-folders endpoint to list directories
 */

import React, { useState, useEffect, useCallback } from 'react';

interface Folder {
  name: string;
  path: string;
  type: 'folder' | 'drive';
}

interface FolderBrowserProps {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export const FolderBrowser: React.FC<FolderBrowserProps> = ({
  initialPath,
  onSelect,
  onClose
}) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState(initialPath || '');

  const browseFolders = useCallback(async (path: string = '') => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/browse-folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setCurrentPath(data.path || '');
        setParentPath(data.parentPath || null);
        setFolders(data.folders || []);
        setManualPath(data.path || '');
      } else {
        setError(data.error || 'Failed to browse folders');
      }
    } catch (err) {
      setError('Failed to connect to backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    // If we have an initial path, try to browse to its parent to show siblings
    if (initialPath) {
      browseFolders(initialPath);
    } else {
      browseFolders('');
    }
  }, [initialPath, browseFolders]);

  const handleFolderClick = (folder: Folder) => {
    browseFolders(folder.path);
  };

  const handleFolderDoubleClick = (folder: Folder) => {
    onSelect(folder.path);
  };

  const handleGoUp = () => {
    if (parentPath !== null) {
      browseFolders(parentPath);
    } else {
      // Go to drives/root
      browseFolders('');
    }
  };

  const handleSelectCurrent = () => {
    if (currentPath) {
      onSelect(currentPath);
    }
  };

  const handleSelectHighlighted = () => {
    if (selectedPath) {
      onSelect(selectedPath);
    } else if (currentPath) {
      onSelect(currentPath);
    }
  };

  const handleManualPathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualPath.trim()) {
      browseFolders(manualPath.trim());
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)' }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-secondary)' }}
        >
          <h3 className="font-semibold text-primary text-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Browse Folders
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-muted hover:text-primary"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Path Input */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
          <form onSubmit={handleManualPathSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="Enter path or browse below..."
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ 
                background: 'var(--bg-elevated)', 
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)'
              }}
            />
            <button
              type="submit"
              className="btn btn-ghost px-3"
              title="Go to path"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </form>
        </div>

        {/* Navigation Bar */}
        <div 
          className="flex items-center gap-2 px-5 py-2"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <button
            onClick={handleGoUp}
            disabled={!parentPath && currentPath === ''}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
            title="Go up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <div className="flex-1 text-sm text-muted truncate">
            {currentPath || 'Select a drive'}
          </div>
          {currentPath && (
            <button
              onClick={handleSelectCurrent}
              className="text-xs px-2 py-1 rounded bg-[var(--accent-primary)] text-black font-medium"
            >
              Select This Folder
            </button>
          )}
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-auto p-2 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted">Loading...</div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="text-danger mb-2">⚠️</div>
              <div className="text-sm text-danger">{error}</div>
              <button
                onClick={() => browseFolders('')}
                className="btn btn-ghost mt-3 text-sm"
              >
                Go to drives
              </button>
            </div>
          ) : folders.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted text-sm">No folders found</div>
            </div>
          ) : (
            <div className="space-y-1">
              {folders.map((folder) => (
                <button
                  key={folder.path}
                  onClick={() => {
                    setSelectedPath(folder.path);
                    handleFolderClick(folder);
                  }}
                  onDoubleClick={() => handleFolderDoubleClick(folder)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    selectedPath === folder.path ? 'bg-[var(--accent-primary)]' : 'hover:bg-[var(--bg-elevated)]'
                  }`}
                  style={selectedPath === folder.path ? { color: '#000' } : {}}
                >
                  {folder.type === 'drive' ? (
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  )}
                  <span className={`flex-1 truncate ${selectedPath === folder.path ? 'font-medium' : 'text-primary'}`}>
                    {folder.name}
                  </span>
                  <svg className="w-4 h-4 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div 
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--border-secondary)' }}
        >
          <p className="text-xs text-muted">
            Click to navigate • Double-click to select
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectHighlighted}
              disabled={!currentPath && !selectedPath}
              className="btn btn-primary"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderBrowser;
