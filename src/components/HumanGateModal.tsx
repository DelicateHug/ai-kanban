import React, { useState, useEffect } from 'react';
import type { Task } from '../core/types';
import { approveHumanGate, rejectHumanGate } from '../core/TaskStore';
import { getAllHistory } from '../core/HistoryManager';
import { getMaxTurnCount } from '../core/config';
import { getContextStatus } from '../core/ContextManager';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AgentActivityPanel } from './AgentActivityPanel';

interface HumanGateModalProps {
  task: Task;
  onClose: () => void;
}

type Tab = 'overview' | 'agents' | 'reviews' | 'work' | 'files' | 'history' | 'request';
type DiffViewMode = 'unified' | 'split' | 'before' | 'after';

export const HumanGateModal: React.FC<HumanGateModalProps> = ({ task, onClose }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [expandedReview, setExpandedReview] = useState<number | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('unified');

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

  const isContinueGate = task.currentStage === 'continue';
  const isApprovalGate = task.currentStage === 'approval';

  const history = getAllHistory(task.id);
  const recentHistory = history.slice(-20);
  const workHistory = history.filter(h => h.stage === 'work');
  const contextStatus = getContextStatus(task);

  const handleApprove = () => {
    approveHumanGate(task.id);
    onClose();
  };

  const handleReject = () => {
    if (showRejectInput) {
      rejectHumanGate(task.id, rejectReason || 'Rejected by human');
      onClose();
    } else {
      setShowRejectInput(true);
    }
  };

  const getVerdictColor = (verdict: string): string => {
    const colors: Record<string, string> = {
      approve: 'badge-success',
      'request-changes': 'badge-warning',
      reject: 'badge-danger'
    };
    return colors[verdict] || 'badge-muted';
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-danger';
  };

  const toggleReview = (index: number) => {
    setExpandedReview(expandedReview === index ? null : index);
  };

  const getActionIcon = (type: string): string => {
    const icons: Record<string, string> = {
      action: '⚡',
      thought: '💭',
      file_change: '📄',
      stage_change: '🔄',
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

  const getActionColor = (type: string): string => {
    const colors: Record<string, string> = {
      action: 'border-l-blue-500',
      thought: 'border-l-purple-500',
      file_change: 'border-l-green-500',
      stage_change: 'border-l-orange-500',
      ai_response: 'border-l-cyan-500',
      error: 'border-l-red-500',
      human_input: 'border-l-yellow-500',
      lock_acquired: 'border-l-gray-500',
      lock_released: 'border-l-gray-500',
      lock_queued: 'border-l-yellow-500',
      lock_denied: 'border-l-red-500',
      summarization: 'border-l-indigo-500'
    };
    return colors[type] || 'border-l-gray-500';
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'agents', label: 'Agents' },
    { id: 'request', label: 'AI Request' },
    { id: 'reviews', label: 'Reviews', count: task.reviews.length },
    { id: 'work', label: 'Work Output' },
    { id: 'files', label: 'Files', count: task.changedFiles.length },
    { id: 'history', label: 'History', count: recentHistory.length }
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-content w-full max-w-5xl animate-slide-up">
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                isContinueGate 
                  ? 'bg-[rgba(255,192,30,0.15)]' 
                  : 'bg-[rgba(0,184,163,0.15)]'
              }`}>
                {isContinueGate ? '⏸️' : '✅'}
              </div>
              <div>
                <h2 className="text-xl font-bold text-primary">
                  {isContinueGate ? 'Continue Gate' : 'Approval Gate'}
                </h2>
                <p className="text-sm text-secondary mt-1">
                  {isContinueGate
                    ? 'Review the task progress and decide whether to continue processing.'
                    : 'Review all actions taken and decide whether to approve completion.'
                  }
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="btn btn-ghost p-2 hover:bg-[var(--bg-elevated)]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Task Title Card */}
          <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
            <h3 className="font-semibold text-primary">{task.title}</h3>
            {task.description && (
              <p className="text-sm text-secondary mt-1 line-clamp-2">{task.description}</p>
            )}
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
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              {/* Stats Grid */}
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

              {/* Cost & Token Usage */}
              <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                  <span>💰</span> Cost & Token Usage
                </h4>
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

              {/* Continue Gate - Turn Based Info */}
              {isContinueGate && (
                <div className="p-4 rounded-lg border-l-4 border-l-[var(--accent-warning)]" style={{ background: 'rgba(255,192,30,0.1)', border: '1px solid var(--border-secondary)' }}>
                  <h4 className="font-semibold text-warning mb-2 flex items-center gap-2">
                    <span>⚠️</span> Turn Limit Reached
                  </h4>
                  <p className="text-sm text-secondary">
                    This task has reached the maximum turn count of <strong className="text-primary">{getMaxTurnCount()}</strong> turns.
                    Current turn count: <strong className="text-primary">{task.turnCount}</strong>.
                  </p>
                  <p className="text-sm text-secondary mt-2">
                    Approving will allow the task to continue processing for another {getMaxTurnCount()} turns.
                  </p>
                </div>
              )}

              {/* Approval Gate - Review Summary */}
              {isApprovalGate && task.reviews.length > 0 && (
                <div className="p-4 rounded-lg border-l-4 border-l-[var(--accent-info)]" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid var(--border-secondary)' }}>
                  <h4 className="font-semibold text-info mb-3 flex items-center gap-2">
                    <span>📊</span> Review Summary
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="stat-card">
                      <div className="stat-value text-success">
                        {task.reviews.filter(r => r.verdict === 'approve').length}
                      </div>
                      <div className="stat-label">Approvals</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-warning">
                        {task.reviews.filter(r => r.verdict === 'request-changes').length}
                      </div>
                      <div className="stat-label">Changes Requested</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-danger">
                        {task.reviews.filter(r => r.verdict === 'reject').length}
                      </div>
                      <div className="stat-label">Rejections</div>
                    </div>
                  </div>
                  {task.reviews.length > 0 && (
                    <div className="mt-3 text-center text-sm text-secondary">
                      Average Score: <strong className="text-primary">
                        {Math.round(task.reviews.reduce((sum, r) => sum + r.score, 0) / task.reviews.length)}
                      </strong>/100
                    </div>
                  )}
                </div>
              )}

              {/* Review Synthesis */}
              {task.reviewSynthesis && (
                <div className="p-4 rounded-lg border-l-4 border-l-[var(--accent-purple)]" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid var(--border-secondary)' }}>
                  <h4 className="font-semibold text-purple-400 mb-3 flex items-center gap-2">
                    <span>📊</span> Review Synthesis
                  </h4>
                  <MarkdownRenderer content={task.reviewSynthesis} className="text-sm" />
                </div>
              )}

              {/* Context Usage */}
              <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                <h4 className="font-semibold text-primary mb-3">Context Usage</h4>
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
              </div>

              {/* Timestamps */}
              <div className="flex gap-6 text-xs text-muted pt-4 border-t border-[var(--border-secondary)]">
                <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Agents Tab */}
          {activeTab === 'agents' && (
            <div className="animate-fade-in">
              <AgentActivityPanel task={task} />
            </div>
          )}

          {/* AI Request Tab */}
          {activeTab === 'request' && (
            <div className="space-y-6 animate-fade-in">
              {task.lastAIRequest ? (
                <>
                  {/* Request Header */}
                  <div className={`p-4 rounded-lg border-l-4 ${task.lastAIRequest.error ? 'border-l-red-500' : 'border-l-blue-500'}`}
                    style={{ 
                      background: task.lastAIRequest.error ? 'rgba(239,71,67,0.1)' : 'var(--bg-card)',
                      border: '1px solid var(--border-secondary)'
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{task.lastAIRequest.error ? '❌' : '🤖'}</span>
                        <div>
                          <h3 className="font-semibold text-primary">Last AI Request</h3>
                          <p className="text-sm text-secondary">
                            {new Date(task.lastAIRequest.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-info">{task.lastAIRequest.stage}</span>
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
                          className="btn btn-secondary text-sm"
                        >
                          📋 Copy Full Request
                        </button>
                      </div>
                    </div>

                    {/* Error Display */}
                    {task.lastAIRequest.error && (
                      <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(239,71,67,0.2)' }}>
                        <div className="text-sm font-semibold text-danger mb-1">Error</div>
                        <div className="text-sm text-danger font-mono break-all">
                          {task.lastAIRequest.error}
                        </div>
                      </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="stat-card">
                        <div className="stat-value">~{task.lastAIRequest.totalTokensEstimate.toLocaleString()}</div>
                        <div className="stat-label">Estimated Tokens</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">
                          {task.lastAIRequest.actualInputTokens !== undefined 
                            ? task.lastAIRequest.actualInputTokens.toLocaleString() 
                            : '—'}
                        </div>
                        <div className="stat-label">Actual Input</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">
                          {task.lastAIRequest.actualOutputTokens !== undefined 
                            ? task.lastAIRequest.actualOutputTokens.toLocaleString() 
                            : '—'}
                        </div>
                        <div className="stat-label">Actual Output</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-value">{task.lastAIRequest.tools.length}</div>
                        <div className="stat-label">Tools Available</div>
                      </div>
                    </div>
                  </div>

                  {/* Tools List */}
                  <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-primary flex items-center gap-2">
                        <span>🔧</span> Available Tools ({task.lastAIRequest.tools.length})
                      </h4>
                      <button
                        onClick={() => navigator.clipboard.writeText(task.lastAIRequest?.tools.join('\n') || '')}
                        className="text-xs text-accent hover:underline"
                      >
                        Copy List
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {task.lastAIRequest.tools.map((tool, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 rounded text-xs font-mono"
                          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* System Prompt */}
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <div className="p-3 flex items-center justify-between" style={{ background: 'var(--bg-elevated)' }}>
                      <h4 className="font-semibold text-primary flex items-center gap-2">
                        <span>📜</span> System Prompt
                      </h4>
                      <button
                        onClick={() => navigator.clipboard.writeText(task.lastAIRequest?.systemPrompt || '')}
                        className="text-xs text-accent hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="p-4 max-h-64 overflow-y-auto">
                      <pre className="text-sm font-mono whitespace-pre-wrap text-secondary">
                        {task.lastAIRequest.systemPrompt}
                      </pre>
                    </div>
                  </div>

                  {/* User Prompt */}
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <div className="p-3 flex items-center justify-between" style={{ background: 'var(--bg-elevated)' }}>
                      <h4 className="font-semibold text-primary flex items-center gap-2">
                        <span>💬</span> User Prompt
                      </h4>
                      <button
                        onClick={() => navigator.clipboard.writeText(task.lastAIRequest?.userPrompt || '')}
                        className="text-xs text-accent hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="p-4 max-h-64 overflow-y-auto">
                      <pre className="text-sm font-mono whitespace-pre-wrap text-secondary">
                        {task.lastAIRequest.userPrompt}
                      </pre>
                    </div>
                  </div>

                  {/* AI Response */}
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <div className="p-3 flex items-center justify-between" style={{ background: 'var(--bg-elevated)' }}>
                      <h4 className="font-semibold text-primary flex items-center gap-2">
                        <span>🤖</span> AI Response
                      </h4>
                      <button
                        onClick={() => navigator.clipboard.writeText(task.lastAIResponse || '')}
                        className="text-xs text-accent hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="p-4 max-h-80 overflow-y-auto">
                      {task.lastAIResponse ? (
                        <MarkdownRenderer content={task.lastAIResponse} className="text-sm" />
                      ) : (
                        <p className="text-sm text-muted italic">No response recorded yet</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted">
                  <div className="text-4xl mb-3">📭</div>
                  <p>No AI request recorded yet</p>
                  <p className="text-sm mt-2">AI request details will appear here after the agent makes a request</p>
                </div>
              )}
            </div>
          )}

          {/* Reviews Tab */}
          {activeTab === 'reviews' && (
            <div className="space-y-6 animate-fade-in">
              {/* Review Synthesis */}
              {task.reviewSynthesis && (
                <div className="p-4 rounded-lg border-l-4 border-l-[var(--accent-purple)]" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid var(--border-secondary)' }}>
                  <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                    <span>📊</span> Combined Review Synthesis
                  </h3>
                  <MarkdownRenderer content={task.reviewSynthesis} />
                </div>
              )}

              {/* Individual Reviews */}
              {task.reviews.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">
                    Individual Reviews ({task.reviews.length})
                  </h3>
                  <div className="space-y-3">
                    {task.reviews.map((review, index) => (
                      <div
                        key={`${review.reviewerId}-${index}`}
                        className="rounded-lg overflow-hidden"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
                      >
                        <button
                          onClick={() => toggleReview(index)}
                          className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">
                              {review.verdict === 'approve' ? '✅' :
                               review.verdict === 'reject' ? '❌' : '⚠️'}
                            </span>
                            <div className="text-left">
                              <div className="font-medium text-primary">{review.reviewerId}</div>
                              <div className="text-xs text-muted">{review.instructionFile}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`badge ${getVerdictColor(review.verdict)}`}>
                              {review.verdict}
                            </span>
                            <span className={`text-lg font-bold ${getScoreColor(review.score)}`}>
                              {review.score}
                            </span>
                            <svg
                              className={`w-5 h-5 text-muted transition-transform ${expandedReview === index ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {expandedReview === index && (
                          <div className="p-4 border-t border-[var(--border-secondary)]" style={{ background: 'var(--bg-elevated)' }}>
                            <div className="text-xs text-muted mb-3">
                              Reviewed at: {new Date(review.timestamp).toLocaleString()}
                            </div>
                            <div className="p-4 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
                              <MarkdownRenderer content={review.output} className="text-sm" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted">
                  <div className="text-4xl mb-3">📭</div>
                  <p>No reviews yet</p>
                </div>
              )}

              {/* Review Stats Summary */}
              {task.reviews.length > 0 && (
                <div className="grid grid-cols-3 gap-4 p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                  <div className="stat-card">
                    <div className="stat-value text-success">
                      {task.reviews.filter(r => r.verdict === 'approve').length}
                    </div>
                    <div className="stat-label">Approvals</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-warning">
                      {task.reviews.filter(r => r.verdict === 'request-changes').length}
                    </div>
                    <div className="stat-label">Changes Requested</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value text-danger">
                      {task.reviews.filter(r => r.verdict === 'reject').length}
                    </div>
                    <div className="stat-label">Rejections</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Work Output Tab */}
          {activeTab === 'work' && (
            <div className="space-y-6 animate-fade-in">
              {/* Working Context */}
              {task.workingContext && (
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                    <span>📝</span> Working Context
                  </h3>
                  <div className="p-4 rounded-lg max-h-64 overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <MarkdownRenderer content={task.workingContext} className="text-sm" />
                  </div>
                </div>
              )}

              {/* Work Stage History */}
              <div>
                <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                  <span>🔧</span> Work Stage Output ({workHistory.length} entries)
                </h3>
                {workHistory.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {workHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`p-4 rounded-lg border-l-4 ${getActionColor(entry.type)}`}
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
                      >
                        <div className="flex items-center gap-2 text-xs text-muted mb-2">
                          <span className="text-base">{getActionIcon(entry.type)}</span>
                          <span className="font-medium uppercase tracking-wide">
                            {entry.type.replace('_', ' ')}
                          </span>
                          <span>•</span>
                          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          {entry.tokens && (
                            <>
                              <span>•</span>
                              <span>{entry.tokens} tokens</span>
                            </>
                          )}
                        </div>
                        <MarkdownRenderer content={entry.content} className="text-sm" />
                        {entry.file && (
                          <div className="mt-2 text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-info)' }}>
                            📄 {entry.file}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted">
                    <div className="text-4xl mb-3">📭</div>
                    <p>No work output recorded yet</p>
                  </div>
                )}
              </div>

              {/* Assigned Files */}
              {task.assignedFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                    <span>📁</span> Assigned Files ({task.assignedFiles.length})
                  </h3>
                  <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <div className="space-y-1">
                      {task.assignedFiles.map((file, index) => (
                        <div key={index} className="text-sm font-mono text-secondary px-2 py-1 rounded hover:bg-[var(--bg-elevated)]">
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="animate-fade-in">
              {task.changedFiles.length > 0 ? (
                <div className="flex gap-4 h-[500px]">
                  {/* File List Panel */}
                  <div className="w-64 flex-shrink-0 overflow-y-auto rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    <div className="p-3 border-b border-[var(--border-secondary)]">
                      <h3 className="text-sm font-semibold text-primary">
                        Changed Files ({task.changedFiles.length})
                      </h3>
                    </div>
                    <div className="p-2 space-y-1">
                      {task.changedFiles.map((change, index) => {
                        const fileName = change.file.split(/[/\\]/).pop() || change.file;
                        const isSelected = selectedFileIndex === index;
                        return (
                          <button
                            key={index}
                            onClick={() => setSelectedFileIndex(index)}
                            className={`w-full text-left p-2 rounded-lg flex items-center gap-2 transition-colors ${
                              isSelected 
                                ? 'bg-[var(--accent-primary)]' 
                                : 'hover:bg-[var(--bg-elevated)]'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              change.action === 'created' ? 'bg-green-500' :
                              change.action === 'modified' ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                            <div className="min-w-0 flex-1">
                              <div className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-primary'}`}>
                                {fileName}
                              </div>
                              <div className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-muted'}`}>
                                {change.action}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* File Detail Panel */}
                  <div className="flex-1 overflow-hidden rounded-lg flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}>
                    {selectedFileIndex !== null ? (
                      <>
                        {/* File Header */}
                        <div className="p-4 border-b border-[var(--border-secondary)] flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`badge ${
                              task.changedFiles[selectedFileIndex].action === 'created' ? 'badge-success' :
                              task.changedFiles[selectedFileIndex].action === 'modified' ? 'badge-warning' : 'badge-danger'
                            }`}>
                              {task.changedFiles[selectedFileIndex].action}
                            </span>
                            <span className="font-mono text-sm text-primary truncate">
                              {task.changedFiles[selectedFileIndex].file}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedFileIndex(selectedFileIndex > 0 ? selectedFileIndex - 1 : null)}
                              disabled={selectedFileIndex === 0}
                              className="btn btn-ghost p-1.5 disabled:opacity-30"
                              title="Previous file"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                            <span className="text-xs text-muted">
                              {selectedFileIndex + 1} / {task.changedFiles.length}
                            </span>
                            <button
                              onClick={() => setSelectedFileIndex(selectedFileIndex < task.changedFiles.length - 1 ? selectedFileIndex + 1 : selectedFileIndex)}
                              disabled={selectedFileIndex === task.changedFiles.length - 1}
                              className="btn btn-ghost p-1.5 disabled:opacity-30"
                              title="Next file"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Description */}
                        {task.changedFiles[selectedFileIndex].description && (
                          <div className="px-4 py-3 border-b border-[var(--border-secondary)]" style={{ background: 'var(--bg-elevated)' }}>
                            <p className="text-sm text-secondary">
                              {task.changedFiles[selectedFileIndex].description}
                            </p>
                          </div>
                        )}

                        {/* View Mode Toggle */}
                        {(task.changedFiles[selectedFileIndex].contentBefore !== undefined || 
                          task.changedFiles[selectedFileIndex].contentAfter !== undefined) && (
                          <div className="px-4 py-2 border-b border-[var(--border-secondary)] flex items-center gap-2" style={{ background: 'var(--bg-elevated)' }}>
                            <span className="text-xs text-muted mr-2">View:</span>
                            {(['unified', 'split', 'before', 'after'] as DiffViewMode[]).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => setDiffViewMode(mode)}
                                className={`px-2 py-1 text-xs rounded ${
                                  diffViewMode === mode 
                                    ? 'bg-[var(--accent-primary)] text-white' 
                                    : 'bg-[var(--bg-card)] text-secondary hover:bg-[var(--bg-tertiary)]'
                                }`}
                              >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Diff View */}
                        <div className="flex-1 overflow-auto p-4">
                          {diffViewMode === 'before' && task.changedFiles[selectedFileIndex].contentBefore !== undefined ? (
                            <div className="font-mono text-xs leading-relaxed rounded-lg overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                              <div className="px-3 py-2 border-b border-[var(--border-secondary)]" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                                <span className="text-red-500 font-semibold">Before Changes</span>
                              </div>
                              {task.changedFiles[selectedFileIndex].contentBefore?.split('\n').map((line, lineIndex) => (
                                <div key={lineIndex} className="flex">
                                  <span className="w-10 flex-shrink-0 px-2 py-0.5 text-right select-none" style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                                    {lineIndex + 1}
                                  </span>
                                  <span className="flex-1 px-2 py-0.5 whitespace-pre" style={{ color: 'var(--text-secondary)' }}>
                                    {line}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : diffViewMode === 'after' && task.changedFiles[selectedFileIndex].contentAfter !== undefined ? (
                            <div className="font-mono text-xs leading-relaxed rounded-lg overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                              <div className="px-3 py-2 border-b border-[var(--border-secondary)]" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                                <span className="text-green-500 font-semibold">After Changes</span>
                              </div>
                              {task.changedFiles[selectedFileIndex].contentAfter?.split('\n').map((line, lineIndex) => (
                                <div key={lineIndex} className="flex">
                                  <span className="w-10 flex-shrink-0 px-2 py-0.5 text-right select-none" style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                                    {lineIndex + 1}
                                  </span>
                                  <span className="flex-1 px-2 py-0.5 whitespace-pre" style={{ color: 'var(--text-secondary)' }}>
                                    {line}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : diffViewMode === 'split' && (task.changedFiles[selectedFileIndex].contentBefore !== undefined || task.changedFiles[selectedFileIndex].contentAfter !== undefined) ? (
                            <div className="flex gap-2 h-full">
                              <div className="flex-1 font-mono text-xs leading-relaxed rounded-lg overflow-hidden overflow-y-auto" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                                <div className="px-3 py-2 border-b border-[var(--border-secondary)] sticky top-0" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                                  <span className="text-red-500 font-semibold">Before</span>
                                </div>
                                {(task.changedFiles[selectedFileIndex].contentBefore || '').split('\n').map((line, lineIndex) => (
                                  <div key={lineIndex} className="flex">
                                    <span className="w-8 flex-shrink-0 px-1 py-0.5 text-right select-none text-[10px]" style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                                      {lineIndex + 1}
                                    </span>
                                    <span className="flex-1 px-1 py-0.5 whitespace-pre" style={{ color: 'var(--text-secondary)' }}>
                                      {line}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex-1 font-mono text-xs leading-relaxed rounded-lg overflow-hidden overflow-y-auto" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                                <div className="px-3 py-2 border-b border-[var(--border-secondary)] sticky top-0" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                                  <span className="text-green-500 font-semibold">After</span>
                                </div>
                                {(task.changedFiles[selectedFileIndex].contentAfter || '').split('\n').map((line, lineIndex) => (
                                  <div key={lineIndex} className="flex">
                                    <span className="w-8 flex-shrink-0 px-1 py-0.5 text-right select-none text-[10px]" style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                                      {lineIndex + 1}
                                    </span>
                                    <span className="flex-1 px-1 py-0.5 whitespace-pre" style={{ color: 'var(--text-secondary)' }}>
                                      {line}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : task.changedFiles[selectedFileIndex].diff ? (
                            <div className="font-mono text-xs leading-relaxed rounded-lg overflow-hidden" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
                              {task.changedFiles[selectedFileIndex].diff.split('\n').map((line, lineIndex) => {
                                let bgColor = 'transparent';
                                let textColor = 'var(--text-secondary)';
                                
                                if (line.startsWith('+') && !line.startsWith('+++')) {
                                  bgColor = 'rgba(34, 197, 94, 0.15)';
                                  textColor = '#22c55e';
                                } else if (line.startsWith('-') && !line.startsWith('---')) {
                                  bgColor = 'rgba(239, 68, 68, 0.15)';
                                  textColor = '#ef4444';
                                } else if (line.startsWith('@@')) {
                                  bgColor = 'rgba(59, 130, 246, 0.15)';
                                  textColor = '#3b82f6';
                                }
                                
                                return (
                                  <div 
                                    key={lineIndex} 
                                    className="flex"
                                    style={{ background: bgColor }}
                                  >
                                    <span className="w-10 flex-shrink-0 px-2 py-0.5 text-right select-none" style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}>
                                      {lineIndex + 1}
                                    </span>
                                    <span className="w-5 flex-shrink-0 text-center py-0.5 select-none" style={{ color: textColor }}>
                                      {line.startsWith('+') && !line.startsWith('+++') ? '+' : 
                                       line.startsWith('-') && !line.startsWith('---') ? '-' : ' '}
                                    </span>
                                    <span className="flex-1 px-2 py-0.5 whitespace-pre" style={{ color: textColor }}>
                                      {line.startsWith('+') || line.startsWith('-') ? line.slice(1) : line}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-12 text-muted">
                              <div className="text-4xl mb-3">📄</div>
                              <p>No diff available for this file</p>
                              <p className="text-xs mt-1">
                                {task.changedFiles[selectedFileIndex].action === 'created' 
                                  ? 'File was created' 
                                  : task.changedFiles[selectedFileIndex].action === 'deleted'
                                  ? 'File was deleted'
                                  : 'File was modified'}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Stats Footer */}
                        {task.changedFiles[selectedFileIndex].diff && (
                          <div className="px-4 py-2 border-t border-[var(--border-secondary)] flex items-center gap-4 text-xs" style={{ background: 'var(--bg-elevated)' }}>
                            <span className="text-green-500">
                              +{task.changedFiles[selectedFileIndex].diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length} lines added
                            </span>
                            <span className="text-red-500">
                              -{task.changedFiles[selectedFileIndex].diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---')).length} lines removed
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-muted">
                        <div className="text-center">
                          <div className="text-4xl mb-3">👈</div>
                          <p>Select a file to view changes</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted">
                  <div className="text-4xl mb-3">📂</div>
                  <p>No files changed</p>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-semibold text-primary">
                Recent Actions ({recentHistory.length})
              </h3>
              {recentHistory.length > 0 ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {recentHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-lg border-l-4 ${getActionColor(entry.type)}`}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted mb-1">
                        <span className="text-base">{getActionIcon(entry.type)}</span>
                        <span className="font-medium uppercase tracking-wide">
                          {entry.type.replace('_', ' ')}
                        </span>
                        <span>•</span>
                        <span className="badge badge-muted">{entry.stage}</span>
                        <span>•</span>
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm text-secondary">{entry.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted">
                  <div className="text-4xl mb-3">📭</div>
                  <p>No history recorded yet</p>
                </div>
              )}
            </div>
          )}

          {/* Reject Reason Input */}
          {showRejectInput && (
            <div className="mt-6 p-4 rounded-lg border-l-4 border-l-[var(--accent-danger)]" style={{ background: 'rgba(239,71,67,0.1)', border: '1px solid var(--border-secondary)' }}>
              <label className="block text-sm font-medium text-danger mb-2">
                Rejection Reason (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                className="input textarea"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleReject} className="btn btn-danger">
            {showRejectInput ? 'Confirm Reject' : 'Reject & Stop'}
          </button>
          <button onClick={handleApprove} className="btn btn-success">
            {isContinueGate ? 'Continue Processing' : 'Approve & Complete'}
          </button>
        </div>
      </div>
    </div>
  );
};
