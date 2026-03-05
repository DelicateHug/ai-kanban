import React, { useState, useEffect } from 'react';
import type { Task } from '../core/types';
import { getDefaultPlanningFiles, getDefaultReviewFiles } from '../core/config';
import { useTaskStore } from '../core/TaskStore';
import { getFallbackFiles, type AvailableFile } from './FileSelector';

interface AgentSelectionModalProps {
  task: Task;
  stage: 'plan' | 'review';
  onClose: () => void;
  onConfirm: (selectedFiles: string[]) => void;
}

export const AgentSelectionModal: React.FC<AgentSelectionModalProps> = ({
  task,
  stage,
  onClose,
  onConfirm,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const updateTask = useTaskStore((state) => state.updateTask);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load available files based on stage
  useEffect(() => {
    async function loadFiles() {
      setIsLoading(true);
      try {
        // Try to fetch files from API
        const type = stage === 'plan' ? 'planning' : 'review';
        const response = await fetch(`/api/instruction-files/${type}`);
        if (response.ok) {
          const data = await response.json();
          setAvailableFiles(data.files || []);
        } else {
          setAvailableFiles(getFallbackFiles(type));
        }
      } catch {
        // Use fallback files
        const type = stage === 'plan' ? 'planning' : 'review';
        setAvailableFiles(getFallbackFiles(type));
      }
      setIsLoading(false);
    }
    loadFiles();
  }, [stage]);
  
  // Get default files based on stage
  const getDefaultFiles = () => {
    if (stage === 'plan') {
      // Use task's planning files if they exist, otherwise get defaults
      return task.planningFiles?.length > 0 
        ? task.planningFiles 
        : getDefaultPlanningFiles();
    } else {
      // Use task's review files if they exist, otherwise get defaults
      return task.reviewFiles?.length > 0 
        ? task.reviewFiles 
        : getDefaultReviewFiles();
    }
  };

  useEffect(() => {
    setSelectedFiles(getDefaultFiles());
  }, [task.id, stage]);

  const handleToggleFile = (file: string) => {
    setSelectedFiles((prev) =>
      prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
    );
  };

  const handleSelectAll = () => {
    setSelectedFiles(availableFiles.map(f => f.path));
  };

  const handleSelectNone = () => {
    setSelectedFiles([]);
  };

  const handleConfirm = () => {
    // Save the selection to the task
    if (stage === 'plan') {
      updateTask(task.id, { planningFiles: selectedFiles });
    } else {
      updateTask(task.id, { reviewFiles: selectedFiles });
    }
    onConfirm(selectedFiles);
  };

  const stageConfig = {
    plan: {
      title: 'Select Planning Agents',
      description: 'Choose which planning instruction files to use. All selected files will be combined for the AI planner.',
      icon: '📋',
      color: 'indigo',
    },
    review: {
      title: 'Select Review Agents',
      description: 'Choose which review agents to run. Each selected file spawns a separate AI reviewer with its own specialized prompt.',
      icon: '🔍',
      color: 'orange',
    },
  };

  const config = stageConfig[stage];
  const accentColor = stage === 'plan' ? 'var(--purple)' : 'var(--accent-orange)';

  // Filter files based on search query
  const filteredFiles = availableFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    file.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
    file.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group files by category
  const groupedFiles = filteredFiles.reduce((acc, file) => {
    if (!acc[file.category]) {
      acc[file.category] = [];
    }
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, AvailableFile[]>);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        {/* Header */}
        <div 
          className="p-6"
          style={{ 
            background: `linear-gradient(135deg, ${accentColor}22 0%, transparent 100%)`,
            borderBottom: '1px solid var(--border-secondary)'
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{config.icon}</span>
            <div>
              <h2 className="text-xl font-bold text-primary">{config.title}</h2>
              <p className="text-sm text-muted mt-1">{config.description}</p>
            </div>
          </div>
        </div>

        {/* Task Info */}
        <div className="p-4" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-secondary)' }}>
          <h3 className="font-semibold text-primary">{task.title}</h3>
          <p className="text-sm text-muted mt-1">
            Current stage: <span className={`badge stage-${task.currentStage}`}>{task.currentStage}</span> → Moving to:{' '}
            <span className={`badge stage-${stage}`}>{stage}</span>
          </p>
        </div>

        {/* File Selection */}
        <div className="modal-body">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: accentColor, borderTopColor: 'transparent' }}></div>
              <span className="ml-3 text-muted">Loading available files...</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-medium text-secondary">
                  {selectedFiles.length} of {availableFiles.length} agents selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm hover:underline"
                    style={{ color: accentColor }}
                  >
                    Select All
                  </button>
                  <span className="text-muted">|</span>
                  <button
                    onClick={handleSelectNone}
                    className="text-sm hover:underline"
                    style={{ color: accentColor }}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search instruction files..."
                  className="w-full pl-10 pr-4 py-2 text-sm rounded-lg"
                  style={{ 
                    background: 'var(--bg-elevated)', 
                    border: '1px solid var(--border-secondary)', 
                    color: 'var(--text-primary)' 
                  }}
                />
              </div>

              {/* File List - Grouped by Category */}
              <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
                {Object.keys(groupedFiles).length === 0 ? (
                  <div className="text-center py-8 text-muted">
                    <p>No files found matching "{searchQuery}"</p>
                  </div>
                ) : (
                  Object.entries(groupedFiles).map(([category, files]) => (
                    <div key={category}>
                      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-4 h-px" style={{ background: accentColor }}></span>
                        {category}
                        <span className="text-xs font-normal">({files.length})</span>
                      </h4>
                      <div className="space-y-1">
                        {files.map((file) => {
                          const isSelected = selectedFiles.includes(file.path);
                          
                          return (
                            <label
                              key={file.path}
                              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:scale-[1.01]"
                              style={{ 
                                background: isSelected ? `${accentColor}18` : 'var(--bg-elevated)',
                                border: `1px solid ${isSelected ? accentColor : 'var(--border-secondary)'}`
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleFile(file.path)}
                                className="w-5 h-5 rounded"
                                style={{ accentColor }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-primary text-sm capitalize truncate">
                                  {file.name}
                                </div>
                                <div className="text-xs text-muted font-mono truncate">
                                  {file.path}
                                </div>
                              </div>
                              {isSelected && (
                                <svg 
                                  className="w-5 h-5 flex-shrink-0" 
                                  fill="currentColor" 
                                  viewBox="0 0 20 20"
                                  style={{ color: accentColor }}
                                >
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedFiles.length === 0 && (
                <div 
                  className="mt-4 p-3 rounded-lg"
                  style={{ background: 'rgba(255,185,64,0.1)', border: '1px solid var(--warning)' }}
                >
                  <p className="text-sm text-warning">
                    ⚠️ No agents selected. At least one agent is recommended for better results.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="modal-footer">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedFiles.length === 0 || isLoading}
            className={`btn ${selectedFiles.length === 0 || isLoading ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'}`}
          >
            Start {stage === 'plan' ? 'Planning' : 'Review'} ({selectedFiles.length} agent{selectedFiles.length !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  );
};
