import React, { useState, useEffect } from 'react';
import type { Task, Stage } from '../core/types';
import { STAGES } from '../core/types';
import { HistoryViewer } from './HistoryViewer';
import { ReviewPanel } from './ReviewPanel';
import { AgentSelectionModal } from './AgentSelectionModal';
import { AgentActivityPanel } from './AgentActivityPanel';
import { getContextStatus } from '../core/ContextManager';
import { useTaskStore } from '../core/TaskStore';
import { useProjectStore } from '../core/ProjectStore';

interface TaskModalProps {
  task: Task;
  onClose: () => void;
  onSelectTask?: (task: Task) => void;  // For drilling into child tasks
}

type Tab = 'overview' | 'agents' | 'history' | 'reviews' | 'files' | 'subtasks' | 'output' | 'debug' | 'lastturn';

export const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSelectTask }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showAgentSelection, setShowAgentSelection] = useState<'plan' | 'review' | null>(null);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const moveToStage = useTaskStore((state) => state.moveToStage);
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const getChildTasks = useTaskStore((state) => state.getChildTasks);
  const getParentTask = useTaskStore((state) => state.getParentTask);
  const getProject = useProjectStore((state) => state.getProject);

  const childTasks = getChildTasks(task.id);
  const parentTask = getParentTask(task.id);
  const hasChildren = childTasks.length > 0;
  const taskProject = task.projectId ? getProject(task.projectId) : null;

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

  const getStageIcon = (stage: Stage): string => {
    const icons: Record<Stage, string> = {
      stopped: '⛔',
      continue: '⏸️',
      backlog: '📋',
      summarize: '📝',
      create: '✨',
      plan: '📐',
      select: '🎯',
      distribute: '📤',
      work: '⚙️',
      review: '🔍',
      approval: '✅',
      complete: '🎉'
    };
    return icons[stage];
  };

  const handleMoveToStage = (stage: Stage) => {
    moveToStage(task.id, stage);
    setShowMoveDropdown(false);
  };

  const contextStatus = getContextStatus(task);

  const handleStartTask = () => {
    // Show agent selection modal for planning
    setShowAgentSelection('plan');
  };

  const handleSkipPlanning = () => {
    // Skip planning and go directly to select stage
    updateTask(task.id, { skipPlanning: true, planningApproved: true });
    moveToStage(task.id, 'select');
    onClose();
  };

  const handleStartReview = () => {
    // Show agent selection modal for review
    setShowAgentSelection('review');
  };

  const handleAgentSelectionConfirm = (selectedFiles: string[]) => {
    if (showAgentSelection === 'plan') {
      updateTask(task.id, { planningFiles: selectedFiles });
      moveToStage(task.id, 'plan');
    } else if (showAgentSelection === 'review') {
      updateTask(task.id, { reviewFiles: selectedFiles });
      moveToStage(task.id, 'review');
    }
    setShowAgentSelection(null);
    onClose();
  };

  const handleDeleteTask = () => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask(task.id);
      onClose();
    }
  };

  const [lastTurnView, setLastTurnView] = useState<'request' | 'response'>('request');

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'agents', label: 'Agents', count: childTasks.length + 1 },
    { id: 'subtasks', label: 'Subtasks', count: childTasks.length },
    { id: 'history', label: 'History' },
    { id: 'lastturn', label: 'AI Turn' },
    { id: 'reviews', label: 'Reviews', count: task.reviews.length },
    { id: 'files', label: 'Files', count: task.changedFiles.length },
    { id: 'output', label: 'Output' },
    { id: 'debug', label: 'Debug' }
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px' }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            {/* Parent task breadcrumb */}
            {parentTask && onSelectTask && (
              <button
                onClick={() => onSelectTask(parentTask)}
                className="text-sm text-accent hover:underline mb-2 flex items-center gap-1"
              >
                ← Back to {parentTask.title}
              </button>
            )}
            {task.isChildTask && (
              <span className="badge badge-purple mb-2">
                Subtask #{(task.childIndex || 0) + 1}
              </span>
            )}
            <h2 className="modal-title">{task.title}</h2>
            <p className="text-secondary text-sm mt-1">
              <span className={`stage-${task.currentStage} px-2 py-0.5 rounded text-xs font-medium mr-2`}>
                {task.currentStage}
              </span>
              Status: {task.status}
              {hasChildren && ` • ${childTasks.filter(c => c.status === 'complete').length}/${childTasks.length} subtasks complete`}
            </p>
            {/* External Access Badge - prominent display */}
            {task.projectId && (
              <div className="flex items-center gap-2 mt-2">
                <span 
                  className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                  style={{ 
                    background: task.allowExternalAccess ? 'rgba(251,191,36,0.2)' : 'rgba(42,196,140,0.2)',
                    color: task.allowExternalAccess ? 'var(--warning)' : 'var(--success)',
                    border: `1px solid ${task.allowExternalAccess ? 'var(--warning)' : 'var(--success)'}`
                  }}
                >
                  {task.allowExternalAccess ? '🔓' : '🔒'}
                  {task.allowExternalAccess ? 'External Access Enabled' : 'Sandboxed'}
                </span>
                {taskProject && (
                  <span className="text-xs text-muted flex items-center gap-1">
                    <span>{taskProject.icon}</span> {taskProject.name}
                  </span>
                )}
              </div>
            )}
            {task.errorMessage && (
              <p className="text-sm text-danger mt-2 p-2 rounded" style={{ background: 'rgba(239,71,67,0.1)' }}>
                ⚠️ {task.errorMessage}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Delete button */}
            <button
              onClick={handleDeleteTask}
              className="p-2 hover:bg-[rgba(239,71,67,0.15)] rounded-lg transition-colors text-muted hover:text-danger"
              title="Delete task"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-muted hover:text-primary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab ${activeTab === tab.id ? 'tab-active' : ''}`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="tab-count">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="modal-body">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-secondary mb-2">Description</h3>
                <p className="text-primary">{task.description || 'No description'}</p>
              </div>

              {/* Project Assignment & Sandboxing */}
              <div>
                <h3 className="text-sm font-semibold text-secondary mb-2">Project & Sandboxing</h3>
                <div 
                  className="p-4 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {taskProject ? (
                      <>
                        <span className="text-xl">{taskProject.icon}</span>
                        <div>
                          <div className="font-medium text-primary flex items-center gap-2">
                            {taskProject.name}
                            <span 
                              className="w-3 h-3 rounded-full inline-block"
                              style={{ backgroundColor: taskProject.color }}
                            />
                          </div>
                          <div className="text-xs text-muted font-mono">{taskProject.path}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-xl">🌐</span>
                        <div>
                          <div className="font-medium text-primary">All Projects (Global)</div>
                          <div className="text-xs text-muted">Not restricted to any specific project folder</div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={task.allowExternalAccess ? 'text-warning' : 'text-success'}>
                        {task.allowExternalAccess ? '⚠️' : '🔒'}
                      </span>
                      <span className="text-secondary">
                        {task.allowExternalAccess 
                          ? 'External file access enabled' 
                          : 'Sandboxed to project folder'}
                      </span>
                    </div>
                    {taskProject && !task.allowExternalAccess && (
                      <span className={`badge badge-success`}>
                        Protected
                      </span>
                    )}
                    {task.allowExternalAccess && (
                      <span className={`badge badge-warning`}>
                        Unrestricted
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <div className="stat-value">{task.turnCount}</div>
                  <div className="stat-label">Turn Count</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{task.reviews.length}</div>
                  <div className="stat-label">Reviews</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{task.changedFiles.length}</div>
                  <div className="stat-label">Files Changed</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{task.assignedFiles.length}</div>
                  <div className="stat-label">Assigned Files</div>
                </div>
              </div>

              {/* Cost Stats */}
              <div>
                <h3 className="text-sm font-semibold text-secondary mb-2">Cost & Token Usage</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="stat-card">
                    <div className="stat-value text-success">${task.totalCost?.toFixed(4) || '0.0000'}</div>
                    <div className="stat-label">Total Cost</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{(task.totalInputTokens || 0).toLocaleString()}</div>
                    <div className="stat-label">Input Tokens</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{(task.totalOutputTokens || 0).toLocaleString()}</div>
                    <div className="stat-label">Output Tokens</div>
                  </div>
                </div>
              </div>

              {/* Context Usage */}
              <div>
                <h3 className="text-sm font-semibold text-secondary mb-2">Context Usage</h3>
                <div className="stat-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-secondary">{contextStatus.message}</span>
                    <span className={`badge ${
                      contextStatus.status === 'safe' ? 'badge-success' :
                      contextStatus.status === 'warning' ? 'badge-warning' : 'badge-danger'
                    }`}>
                      {contextStatus.percent}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${
                        contextStatus.status === 'safe' ? 'progress-success' :
                        contextStatus.status === 'warning' ? 'progress-warning' : 'progress-danger'
                      }`}
                      style={{ width: `${Math.min(contextStatus.percent, 100)}%` }}
                    />
                  </div>
                  {task.contextSummarized && (
                    <p className="text-xs text-muted mt-2">
                      ℹ️ Context has been summarized to reduce token usage
                    </p>
                  )}
                </div>
              </div>

              {/* Working Context Preview */}
              {task.workingContext && (
                <div>
                  <h3 className="text-sm font-semibold text-secondary mb-2">Working Context</h3>
                  <div 
                    className="p-4 rounded-lg max-h-48 overflow-y-auto"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <pre className="text-xs text-secondary whitespace-pre-wrap font-mono">
                      {task.workingContext.slice(0, 1000)}
                      {task.workingContext.length > 1000 && '...'}
                    </pre>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex gap-4 text-xs text-muted">
                <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-4" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                {task.currentStage === 'create' && (
                  <>
                    <button
                      onClick={handleStartTask}
                      className="btn btn-primary"
                    >
                      ▶ Start Planning
                    </button>
                    <button
                      onClick={handleSkipPlanning}
                      className="btn"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                    >
                      ⏭ Skip Planning
                    </button>
                  </>
                )}
                {task.currentStage === 'work' && (
                  <button
                    onClick={handleStartReview}
                    className="btn"
                    style={{ background: 'var(--accent-orange)', color: 'white' }}
                  >
                    🔍 Start Review
                  </button>
                )}
                
                {/* Move to Stage dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                    className="btn"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                  >
                    📦 Move to Stage
                  </button>
                  
                  {showMoveDropdown && (
                    <div 
                      className="absolute bottom-full left-0 mb-1 py-1 rounded-lg shadow-xl z-50 min-w-[180px]"
                      style={{ 
                        background: 'var(--bg-elevated)', 
                        border: '1px solid var(--border-secondary)',
                        maxHeight: '320px',
                        overflowY: 'auto'
                      }}
                    >
                      {STAGES.filter(stage => stage !== task.currentStage).map((stage) => (
                        <button
                          key={stage}
                          onClick={() => handleMoveToStage(stage)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <span>{getStageIcon(stage)}</span>
                          <span className="capitalize">{stage}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleDeleteTask}
                  className="btn btn-danger"
                >
                  🗑 Delete Task
                </button>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <AgentActivityPanel task={task} />
          )}

          {activeTab === 'subtasks' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-secondary">
                Subtasks ({childTasks.length})
              </h3>
              
              {childTasks.length === 0 ? (
                <div className="text-center py-8 text-muted">
                  <p>No subtasks yet</p>
                  <p className="text-sm mt-1">Subtasks are created during the distribute phase</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {childTasks.map((child, index) => (
                    <div
                      key={child.id}
                      onClick={() => onSelectTask?.(child)}
                      className="p-4 rounded-lg cursor-pointer transition-colors"
                      style={{ 
                        background: 'var(--bg-elevated)', 
                        border: `1px solid ${
                          child.status === 'complete' ? 'var(--success)' :
                          child.status === 'stopped' ? 'var(--danger)' :
                          child.status === 'processing' ? 'var(--info)' : 'var(--border-secondary)'
                        }`
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted">#{index + 1}</span>
                          <h4 className="font-medium text-primary">{child.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`badge ${
                            child.status === 'complete' ? 'badge-success' :
                            child.status === 'stopped' ? 'badge-danger' :
                            child.status === 'processing' ? 'badge-info' : 'badge-muted'
                          }`}>
                            {child.status}
                          </span>
                          <span className={`badge stage-${child.currentStage}`}>{child.currentStage}</span>
                        </div>
                      </div>
                      {child.description && (
                        <p className="text-sm text-secondary mt-1 line-clamp-2">{child.description}</p>
                      )}
                      {child.errorMessage && (
                        <p className="text-sm text-danger mt-2 p-2 rounded" style={{ background: 'rgba(239,71,67,0.1)' }}>
                          ⚠️ {child.errorMessage}
                        </p>
                      )}
                      {child.assignedFiles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {child.assignedFiles.slice(0, 3).map((file, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                              {file.split('/').pop()}
                            </span>
                          ))}
                          {child.assignedFiles.length > 3 && (
                            <span className="text-xs text-muted">+{child.assignedFiles.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Subtask summary */}
              {childTasks.length > 0 && (
                <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <h4 className="text-sm font-medium text-secondary mb-2">Summary</h4>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="stat-card">
                      <div className="stat-value">{childTasks.length}</div>
                      <div className="stat-label">Total</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-success">
                        {childTasks.filter(c => c.status === 'complete').length}
                      </div>
                      <div className="stat-label">Complete</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-info">
                        {childTasks.filter(c => c.status === 'processing').length}
                      </div>
                      <div className="stat-label">In Progress</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-danger">
                        {childTasks.filter(c => c.status === 'stopped').length}
                      </div>
                      <div className="stat-label">Stopped</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <HistoryViewer taskId={task.id} />
          )}

          {activeTab === 'reviews' && (
            <ReviewPanel task={task} />
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              {/* Assigned Files */}
              <div>
                <h3 className="text-sm font-semibold text-secondary mb-2">
                  Assigned Files ({task.assignedFiles.length})
                </h3>
                {task.assignedFiles.length === 0 ? (
                  <p className="text-muted text-sm">No files assigned yet</p>
                ) : (
                  <div className="space-y-1">
                    {task.assignedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="px-3 py-2 rounded text-sm font-mono text-secondary"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        📄 {file}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Changed Files */}
              <div>
                <h3 className="text-sm font-semibold text-secondary mb-2">
                  Changed Files ({task.changedFiles.length})
                </h3>
                {task.changedFiles.length === 0 ? (
                  <p className="text-muted text-sm">No files changed yet</p>
                ) : (
                  <div className="space-y-2">
                    {task.changedFiles.map((change, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`badge ${
                            change.action === 'created' ? 'badge-success' :
                            change.action === 'modified' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {change.action}
                          </span>
                          <span className="font-mono text-sm text-primary">
                            {change.file}
                          </span>
                        </div>
                        <p className="text-xs text-muted">{change.description}</p>
                        {change.diff && (
                          <pre 
                            className="mt-2 p-2 text-xs rounded overflow-x-auto"
                            style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                          >
                            {change.diff}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'output' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-secondary">Final Output</h3>
                {task.finalOutput && (
                  <button
                    onClick={() => navigator.clipboard.writeText(task.finalOutput)}
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    📋 Copy to Clipboard
                  </button>
                )}
              </div>
              
              {!task.finalOutput ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📝</div>
                  <p className="text-muted">No output yet</p>
                  <p className="text-sm text-muted mt-1">
                    The final output will appear here when the task is completed
                  </p>
                </div>
              ) : (
                <div 
                  className="p-4 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                >
                  <pre className="whitespace-pre-wrap text-sm text-primary font-mono overflow-x-auto">
                    {task.finalOutput}
                  </pre>
                </div>
              )}

              {/* Output Stats */}
              {task.finalOutput && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="stat-card">
                    <div className="stat-value">{task.finalOutput.length.toLocaleString()}</div>
                    <div className="stat-label">Characters</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{task.finalOutput.split('\n').length.toLocaleString()}</div>
                    <div className="stat-label">Lines</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'lastturn' && (
            <div className="space-y-4">
              {/* Header with stats */}
              {task.lastAIRequest && (
                <div 
                  className="p-4 rounded-lg"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(42,196,140,0.08) 0%, rgba(96,165,250,0.08) 100%)',
                    border: '1px solid var(--border-secondary)'
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        🤖
                      </div>
                      <div>
                        <h3 className="font-semibold text-primary">Last AI Request</h3>
                        <div className="text-xs text-muted">
                          {new Date(task.lastAIRequest.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <span 
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{ 
                        background: 'rgba(96,165,250,0.2)',
                        color: 'var(--info)'
                      }}
                    >
                      {task.lastAIRequest.stage}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-accent">~{task.lastAIRequest.totalTokensEstimate.toLocaleString()}</div>
                      <div className="text-xs text-muted">tokens</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-info">{task.lastAIRequest.tools.length}</div>
                      <div className="text-xs text-muted">tools</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-purple">{task.lastAIRequest.systemPrompt.length.toLocaleString()}</div>
                      <div className="text-xs text-muted">sys chars</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-success">{task.lastAIRequest.userPrompt.length.toLocaleString()}</div>
                      <div className="text-xs text-muted">user chars</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Toggle between Request and Response */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 p-1.5 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                  <button
                    onClick={() => setLastTurnView('request')}
                    className={`px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2 ${
                      lastTurnView === 'request' 
                        ? 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-black font-semibold shadow-lg' 
                        : 'text-secondary hover:text-primary hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <span>📤</span> Request
                  </button>
                  <button
                    onClick={() => setLastTurnView('response')}
                    className={`px-5 py-2.5 text-sm rounded-lg transition-all flex items-center gap-2 ${
                      lastTurnView === 'response' 
                        ? 'bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-black font-semibold shadow-lg' 
                        : 'text-secondary hover:text-primary hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <span>📥</span> Response
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (lastTurnView === 'request' && task.lastAIRequest) {
                      navigator.clipboard.writeText(
                        `System Prompt:\n${task.lastAIRequest.systemPrompt}\n\nUser Prompt:\n${task.lastAIRequest.userPrompt}`
                      );
                    } else if (lastTurnView === 'response' && task.lastAIResponse) {
                      navigator.clipboard.writeText(task.lastAIResponse);
                    }
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5 hover:bg-[var(--bg-elevated)]"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy Full {lastTurnView === 'request' ? 'Request' : 'Response'}
                </button>
              </div>

              {lastTurnView === 'request' ? (
                /* Request View */
                !task.lastAIRequest ? (
                  <div className="text-center py-16" style={{ background: 'var(--bg-elevated)', borderRadius: '12px' }}>
                    <div className="text-5xl mb-4 opacity-50">📤</div>
                    <p className="text-muted text-lg font-medium">No AI request recorded yet</p>
                    <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
                      The last AI request will appear here once the task starts processing
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Error if any */}
                    {task.lastAIRequest.error && (
                      <div 
                        className="p-4 rounded-xl border-l-4"
                        style={{ 
                          background: 'rgba(239,71,67,0.1)',
                          borderLeftColor: 'var(--danger)'
                        }}
                      >
                        <div className="flex items-center gap-2 text-danger font-semibold mb-2">
                          <span>❌</span> Error Occurred
                        </div>
                        <pre className="text-sm text-danger font-mono break-all whitespace-pre-wrap">
                          {task.lastAIRequest.error}
                        </pre>
                      </div>
                    )}

                    {/* System Prompt */}
                    <div 
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--border-secondary)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                    >
                      <div 
                        className="px-4 py-3 flex items-center justify-between"
                        style={{ background: 'linear-gradient(90deg, rgba(139,92,246,0.15) 0%, transparent 100%)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📋</span>
                          <span className="text-sm font-semibold text-primary">System Prompt</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                            {task.lastAIRequest.systemPrompt.length.toLocaleString()} chars
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(task.lastAIRequest!.systemPrompt)}
                            className="text-xs text-muted hover:text-primary transition-colors"
                            title="Copy system prompt"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                      <div 
                        className="p-4 max-h-[280px] overflow-y-auto"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <pre className="whitespace-pre-wrap text-xs text-secondary font-mono leading-relaxed">
                          {task.lastAIRequest.systemPrompt}
                        </pre>
                      </div>
                    </div>

                    {/* User Prompt */}
                    <div 
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--border-secondary)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                    >
                      <div 
                        className="px-4 py-3 flex items-center justify-between"
                        style={{ background: 'linear-gradient(90deg, rgba(42,196,140,0.15) 0%, transparent 100%)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">💬</span>
                          <span className="text-sm font-semibold text-primary">User Prompt</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                            {task.lastAIRequest.userPrompt.length.toLocaleString()} chars
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(task.lastAIRequest!.userPrompt)}
                            className="text-xs text-muted hover:text-primary transition-colors"
                            title="Copy user prompt"
                          >
                            📋
                          </button>
                        </div>
                      </div>
                      <div 
                        className="p-4 max-h-[350px] overflow-y-auto"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <pre className="whitespace-pre-wrap text-xs text-secondary font-mono leading-relaxed">
                          {task.lastAIRequest.userPrompt}
                        </pre>
                      </div>
                    </div>

                    {/* Tools Used */}
                    {task.lastAIRequest.tools.length > 0 && (
                      <div 
                        className="rounded-xl overflow-hidden"
                        style={{ border: '1px solid var(--border-secondary)' }}
                      >
                        <div 
                          className="px-4 py-3 flex items-center justify-between"
                          style={{ background: 'linear-gradient(90deg, rgba(96,165,250,0.15) 0%, transparent 100%)' }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🔧</span>
                            <span className="text-sm font-semibold text-primary">Tools Available</span>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                            {task.lastAIRequest.tools.length} tools
                          </span>
                        </div>
                        <div 
                          className="p-4 max-h-[150px] overflow-y-auto"
                          style={{ background: 'var(--bg-elevated)' }}
                        >
                          <div className="flex flex-wrap gap-2">
                            {task.lastAIRequest.tools.map((tool, i) => (
                              <span 
                                key={i}
                                className="px-2 py-1 text-xs rounded-md font-mono"
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--info)' }}
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Response View */
                !task.lastAIResponse ? (
                  <div className="text-center py-16" style={{ background: 'var(--bg-elevated)', borderRadius: '12px' }}>
                    <div className="text-5xl mb-4 opacity-50">📥</div>
                    <p className="text-muted text-lg font-medium">No AI response recorded yet</p>
                    <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
                      The last AI response will appear here once the AI responds
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Response Stats */}
                    <div 
                      className="flex items-center gap-6 px-4 py-3 rounded-xl"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted">📊</span>
                        <span className="text-sm text-muted">{task.lastAIResponse.length.toLocaleString()} characters</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">📝</span>
                        <span className="text-sm text-muted">{task.lastAIResponse.split('\n').length} lines</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">📖</span>
                        <span className="text-sm text-muted">~{Math.round(task.lastAIResponse.length / 4).toLocaleString()} tokens</span>
                      </div>
                    </div>

                    {/* Response Content */}
                    <div 
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--border-secondary)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                    >
                      <div 
                        className="px-4 py-3 flex items-center justify-between"
                        style={{ background: 'linear-gradient(90deg, rgba(42,196,140,0.2) 0%, rgba(96,165,250,0.1) 100%)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🤖</span>
                          <span className="text-sm font-semibold text-primary">AI Response</span>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(task.lastAIResponse || '')}
                          className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-1"
                          title="Copy response"
                        >
                          📋 Copy
                        </button>
                      </div>
                      <div 
                        className="p-4 max-h-[500px] overflow-y-auto"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        <pre className="whitespace-pre-wrap text-sm text-primary font-mono leading-relaxed">
                          {task.lastAIResponse}
                        </pre>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-secondary">Last AI Request</h3>
                {task.lastAIRequest && (
                  <button
                    onClick={() => {
                      const debugInfo = JSON.stringify({
                        timestamp: task.lastAIRequest?.timestamp,
                        stage: task.lastAIRequest?.stage,
                        systemPrompt: task.lastAIRequest?.systemPrompt,
                        userPrompt: task.lastAIRequest?.userPrompt,
                        tools: task.lastAIRequest?.tools,
                        totalTokensEstimate: task.lastAIRequest?.totalTokensEstimate,
                        error: task.lastAIRequest?.error
                      }, null, 2);
                      navigator.clipboard.writeText(debugInfo);
                    }}
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    📋 Copy All
                  </button>
                )}
              </div>

              {!task.lastAIRequest ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">🔍</div>
                  <p className="text-muted">No AI request recorded yet</p>
                  <p className="text-sm text-muted mt-1">
                    The last AI request will appear here once the task starts processing
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Error Banner */}
                  {task.lastAIRequest.error && (
                    <div 
                      className="p-4 rounded-lg border-l-4 border-l-red-500"
                      style={{ background: 'rgba(239,71,67,0.1)', border: '1px solid rgba(239,71,67,0.3)' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">❌</span>
                        <span className="font-semibold text-danger">Request Failed</span>
                      </div>
                      <pre className="text-sm text-danger whitespace-pre-wrap font-mono overflow-x-auto">
                        {task.lastAIRequest.error}
                      </pre>
                    </div>
                  )}

                  {/* Request Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="stat-card">
                      <div className="stat-value text-xs">{new Date(task.lastAIRequest.timestamp).toLocaleTimeString()}</div>
                      <div className="stat-label">Timestamp</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-sm">{task.lastAIRequest.stage}</div>
                      <div className="stat-label">Stage</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{task.lastAIRequest.totalTokensEstimate.toLocaleString()}</div>
                      <div className="stat-label">Est. Tokens</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{task.lastAIRequest.tools.length}</div>
                      <div className="stat-label">Tools</div>
                    </div>
                  </div>

                  {/* Tools List */}
                  {task.lastAIRequest.tools.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-secondary">Available Tools</h4>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {task.lastAIRequest.tools.map((tool, index) => (
                          <span 
                            key={index}
                            className="px-2 py-1 rounded text-xs font-mono"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* System Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-secondary">System Prompt</h4>
                      <button
                        onClick={() => navigator.clipboard.writeText(task.lastAIRequest?.systemPrompt || '')}
                        className="text-xs text-accent hover:underline"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div 
                      className="p-4 rounded-lg max-h-[300px] overflow-y-auto"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                    >
                      <pre className="whitespace-pre-wrap text-xs text-secondary font-mono">
                        {task.lastAIRequest.systemPrompt}
                      </pre>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {task.lastAIRequest.systemPrompt.length.toLocaleString()} characters
                    </div>
                  </div>

                  {/* User Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-secondary">User Prompt</h4>
                      <button
                        onClick={() => navigator.clipboard.writeText(task.lastAIRequest?.userPrompt || '')}
                        className="text-xs text-accent hover:underline"
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div 
                      className="p-4 rounded-lg max-h-[400px] overflow-y-auto"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                    >
                      <pre className="whitespace-pre-wrap text-xs text-secondary font-mono">
                        {task.lastAIRequest.userPrompt}
                      </pre>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      {task.lastAIRequest.userPrompt.length.toLocaleString()} characters
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent Selection Modal */}
      {showAgentSelection && (
        <AgentSelectionModal
          task={task}
          stage={showAgentSelection}
          onClose={() => setShowAgentSelection(null)}
          onConfirm={handleAgentSelectionConfirm}
        />
      )}
    </div>
  );
};
