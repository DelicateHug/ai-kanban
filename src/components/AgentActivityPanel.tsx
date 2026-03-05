import React, { useState } from 'react';
import type { Task, HistoryEntry } from '../core/types';
import { getAllHistory } from '../core/HistoryManager';
import { useTaskStore } from '../core/TaskStore';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AgentActivityPanelProps {
  task: Task;
  onSelectTask?: (task: Task) => void;
}

interface AgentInfo {
  id: string;
  name: string;
  type: 'main' | 'child';
  task: Task;
  actions: HistoryEntry[];
  status: string;
  stage: string;
}

export const AgentActivityPanel: React.FC<AgentActivityPanelProps> = ({ task, onSelectTask }) => {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(task.id);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hierarchy' | 'timeline'>('hierarchy');
  
  const getChildTasks = useTaskStore((state) => state.getChildTasks);
  const childTasks = getChildTasks(task.id);
  
  // Build agent information
  const buildAgentInfo = (t: Task, type: 'main' | 'child'): AgentInfo => {
    const history = getAllHistory(t.id);
    return {
      id: t.id,
      name: type === 'main' ? `Main Agent: ${t.title}` : `Child Agent #${(t.childIndex || 0) + 1}`,
      type,
      task: t,
      actions: history,
      status: t.status,
      stage: t.currentStage
    };
  };
  
  const mainAgent = buildAgentInfo(task, 'main');
  const childAgents = childTasks.map(ct => buildAgentInfo(ct, 'child'));
  const allAgents = [mainAgent, ...childAgents];
  
  // Get all actions sorted by time for timeline view
  const allActions = allAgents
    .flatMap(agent => agent.actions.map(action => ({ ...action, agentId: agent.id, agentName: agent.name, agentType: agent.type })))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      active: 'status-dot-active',
      processing: 'status-dot-processing',
      waiting: 'status-dot-waiting',
      'blocked-human': 'status-dot-blocked',
      complete: 'status-dot-complete',
      failed: 'status-dot-failed',
      stopped: 'status-dot-stopped'
    };
    return colors[status] || 'status-dot-stopped';
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

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const toggleAgent = (agentId: string) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
  };

  const toggleAction = (actionId: string) => {
    setExpandedAction(expandedAction === actionId ? null : actionId);
  };

  return (
    <div className="space-y-4">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-primary">Agent Activity</h3>
          <span className="badge badge-info">
            {allAgents.length} agent{allAgents.length !== 1 ? 's' : ''}
          </span>
          <span className="badge badge-muted">
            {allActions.length} action{allActions.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
          <button
            onClick={() => setViewMode('hierarchy')}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              viewMode === 'hierarchy' 
                ? 'bg-[var(--accent-primary)] text-black font-medium' 
                : 'text-secondary hover:text-primary'
            }`}
          >
            🏗️ Hierarchy
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              viewMode === 'timeline' 
                ? 'bg-[var(--accent-primary)] text-black font-medium' 
                : 'text-secondary hover:text-primary'
            }`}
          >
            📋 Timeline
          </button>
        </div>
      </div>

{viewMode === 'hierarchy' ? (
        /* Hierarchy View - Shows agents as a tree */
        <div className="space-y-3">
          {allAgents.map((agent) => (
            <div 
              key={agent.id} 
              className={`rounded-lg overflow-hidden border transition-all ${
                agent.type === 'main' 
                  ? 'border-l-4 border-l-[var(--accent-primary)] border-[var(--border-primary)]' 
                  : 'border-l-4 border-l-[var(--accent-info)] border-[var(--border-secondary)] ml-6'
              }`}
              style={{ background: 'var(--bg-card)' }}
            >
              {/* Agent Header */}
              <button
                onClick={() => toggleAgent(agent.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{agent.type === 'main' ? '🤖' : '🔧'}</span>
                  <div className="text-left">
                    <div className="font-medium text-primary">{agent.name}</div>
                    <div className="text-xs text-secondary flex items-center gap-2">
                      <span className={`status-dot ${getStatusColor(agent.status)}`} />
                      <span>{agent.status}</span>
                      <span className="text-muted">•</span>
                      <span className="text-muted">{agent.stage}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{agent.actions.length} actions</span>
                  <svg
                    className={`w-5 h-5 text-muted transition-transform ${expandedAgent === agent.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Agent Actions */}
              {expandedAgent === agent.id && (
                <div className="border-t border-[var(--border-secondary)]">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-4 gap-2 p-4" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="stat-card">
                      <div className="stat-value text-lg">{agent.task.turnCount}</div>
                      <div className="stat-label">Turns</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-lg">{agent.actions.filter(a => a.type === 'ai_response').length}</div>
                      <div className="stat-label">AI Responses</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-lg">{agent.actions.filter(a => a.type === 'file_change').length}</div>
                      <div className="stat-label">File Changes</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value text-lg">{agent.task.reviews.length}</div>
                      <div className="stat-label">Reviews</div>
                    </div>
                  </div>

                  {/* Last AI Request Debug Info - Enhanced */}
                  {agent.task.lastAIRequest && (
                    <div className="px-4 pb-4">
                      <div 
                        className={`rounded-lg overflow-hidden ${agent.task.lastAIRequest.error ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500'}`}
                        style={{ 
                          background: agent.task.lastAIRequest.error ? 'rgba(239,71,67,0.1)' : 'var(--bg-tertiary)',
                          border: '1px solid var(--border-secondary)'
                        }}
                      >
                        {/* Request Header */}
                        <div className="p-3 flex items-center justify-between" style={{ background: 'var(--bg-elevated)' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{agent.task.lastAIRequest.error ? '❌' : '🤖'}</span>
                            <span className="font-semibold text-primary">Last AI Request</span>
                            <span className="badge badge-info text-xs">{agent.task.lastAIRequest.stage}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted">
                              {new Date(agent.task.lastAIRequest.timestamp).toLocaleTimeString()}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const debugInfo = JSON.stringify({
                                  timestamp: agent.task.lastAIRequest?.timestamp,
                                  stage: agent.task.lastAIRequest?.stage,
                                  systemPrompt: agent.task.lastAIRequest?.systemPrompt,
                                  userPrompt: agent.task.lastAIRequest?.userPrompt,
                                  tools: agent.task.lastAIRequest?.tools,
                                  totalTokensEstimate: agent.task.lastAIRequest?.totalTokensEstimate,
                                  error: agent.task.lastAIRequest?.error
                                }, null, 2);
                                navigator.clipboard.writeText(debugInfo);
                              }}
                              className="btn btn-ghost text-xs px-2 py-1"
                            >
                              📋 Copy Full Request
                            </button>
                          </div>
                        </div>

                        {/* Error Display */}
                        {agent.task.lastAIRequest.error && (
                          <div className="px-3 py-2" style={{ background: 'rgba(239,71,67,0.2)' }}>
                            <div className="text-xs text-danger font-mono break-all">
                              {agent.task.lastAIRequest.error}
                            </div>
                          </div>
                        )}

                        {/* Stats Row */}
                        <div className="p-3 flex flex-wrap items-center gap-4 text-xs border-t border-[var(--border-secondary)]">
                          <div className="flex items-center gap-2">
                            <span className="text-muted">Est:</span>
                            <span className="font-semibold text-primary">~{agent.task.lastAIRequest.totalTokensEstimate.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">In:</span>
                            <span className="font-semibold text-primary">
                              {agent.task.lastAIRequest.actualInputTokens !== undefined 
                                ? agent.task.lastAIRequest.actualInputTokens.toLocaleString() 
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">Out:</span>
                            <span className="font-semibold text-primary">
                              {agent.task.lastAIRequest.actualOutputTokens !== undefined 
                                ? agent.task.lastAIRequest.actualOutputTokens.toLocaleString() 
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">Tools:</span>
                            <span className="font-semibold text-primary">{agent.task.lastAIRequest.tools.length}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted">Stage:</span>
                            <span className="font-semibold text-primary">{agent.task.lastAIRequest.stage}</span>
                          </div>
                        </div>

                        {/* Expandable Details */}
                        <details className="border-t border-[var(--border-secondary)]">
                          <summary className="p-3 cursor-pointer text-sm text-secondary hover:text-primary hover:bg-[var(--bg-card-hover)] transition-colors select-none">
                            📜 View System Prompt
                          </summary>
                          <div className="p-3 max-h-40 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
                            <pre className="text-xs font-mono whitespace-pre-wrap text-muted">
                              {agent.task.lastAIRequest.systemPrompt}
                            </pre>
                          </div>
                        </details>

                        <details className="border-t border-[var(--border-secondary)]">
                          <summary className="p-3 cursor-pointer text-sm text-secondary hover:text-primary hover:bg-[var(--bg-card-hover)] transition-colors select-none">
                            💬 View User Prompt
                          </summary>
                          <div className="p-3 max-h-40 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
                            <pre className="text-xs font-mono whitespace-pre-wrap text-muted">
                              {agent.task.lastAIRequest.userPrompt}
                            </pre>
                          </div>
                        </details>

                        <details className="border-t border-[var(--border-secondary)]">
                          <summary className="p-3 cursor-pointer text-sm text-secondary hover:text-primary hover:bg-[var(--bg-card-hover)] transition-colors select-none">
                            🔧 View Tools ({agent.task.lastAIRequest.tools.length})
                          </summary>
                          <div className="p-3 flex flex-wrap gap-1 max-h-32 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
                            {agent.task.lastAIRequest.tools.map((tool, index) => (
                              <span
                                key={index}
                                className="px-2 py-0.5 rounded text-xs font-mono"
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </details>

                        <details className="border-t border-[var(--border-secondary)]">
                          <summary className="p-3 cursor-pointer text-sm text-secondary hover:text-primary hover:bg-[var(--bg-card-hover)] transition-colors select-none">
                            🤖 View AI Response
                          </summary>
                          <div className="p-3 max-h-40 overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
                            {agent.task.lastAIResponse ? (
                              <MarkdownRenderer content={agent.task.lastAIResponse} className="text-xs" />
                            ) : (
                              <p className="text-xs text-muted italic">No response recorded yet</p>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                  )}

                  {/* Actions List */}
                  <div className="max-h-[400px] overflow-y-auto p-4 space-y-2">
                    {agent.actions.length === 0 ? (
                      <div className="text-center py-8 text-muted">
                        <div className="text-3xl mb-2">📭</div>
                        <p>No actions recorded yet</p>
                      </div>
                    ) : (
                      agent.actions.slice().reverse().map((action) => (
                        <div
                          key={action.id}
                          className={`rounded-lg border-l-4 ${getActionColor(action.type)} overflow-hidden`}
                          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
                        >
                          <button
                            onClick={() => toggleAction(action.id)}
                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--bg-elevated)] transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">{getActionIcon(action.type)}</span>
                              <span className="text-xs font-medium text-secondary uppercase tracking-wide">
                                {action.type.replace('_', ' ')}
                              </span>
                              <span className="badge badge-muted text-xs">{action.stage}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted">{formatTime(action.timestamp)}</span>
                              <svg
                                className={`w-4 h-4 text-muted transition-transform ${expandedAction === action.id ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {expandedAction === action.id && (
                            <div className="px-3 py-3 border-t border-[var(--border-secondary)]" style={{ background: 'var(--bg-card)' }}>
                              <MarkdownRenderer content={action.content} className="text-sm" />
                              {action.file && (
                                <div className="mt-2 px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-info)' }}>
                                  📄 {action.file}
                                </div>
                              )}
                              {action.tokens && (
                                <div className="mt-2 text-xs text-muted">
                                  Tokens: {action.tokens.toLocaleString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* View Full Details Button */}
                  {agent.type === 'child' && onSelectTask && (
                    <div className="p-3 border-t border-[var(--border-secondary)]" style={{ background: 'var(--bg-elevated)' }}>
                      <button
                        onClick={() => onSelectTask(agent.task)}
                        className="btn btn-secondary w-full"
                      >
                        View Full Agent Details →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Timeline View - Shows all actions chronologically */
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {allActions.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <div className="text-4xl mb-3">📭</div>
              <p>No actions recorded yet</p>
            </div>
          ) : (
            allActions.map((action) => (
              <div
                key={action.id}
                className={`rounded-lg border-l-4 ${getActionColor(action.type)} overflow-hidden`}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
              >
                <button
                  onClick={() => toggleAction(action.id)}
                  className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">{getActionIcon(action.type)}</span>
                    <span className={`badge text-xs ${action.agentType === 'main' ? 'badge-warning' : 'badge-info'}`}>
                      {action.agentType === 'main' ? '🤖 Main' : `🔧 Child #${allAgents.find(a => a.id === action.agentId)?.task.childIndex !== undefined ? (allAgents.find(a => a.id === action.agentId)!.task.childIndex! + 1) : '?'}`}
                    </span>
                    <span className="text-xs font-medium text-secondary uppercase tracking-wide">
                      {action.type.replace('_', ' ')}
                    </span>
                    <span className="badge badge-muted text-xs">{action.stage}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{formatTime(action.timestamp)}</span>
                    <svg
                      className={`w-4 h-4 text-muted transition-transform ${expandedAction === action.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedAction === action.id && (
                  <div className="px-3 py-3 border-t border-[var(--border-secondary)]" style={{ background: 'var(--bg-elevated)' }}>
                    <MarkdownRenderer content={action.content} className="text-sm" />
                    {action.file && (
                      <div className="mt-2 px-2 py-1 rounded text-xs font-mono" style={{ background: 'var(--bg-tertiary)', color: 'var(--accent-info)' }}>
                        📄 {action.file}
                      </div>
                    )}
                    {action.tokens && (
                      <div className="mt-2 text-xs text-muted">
                        Tokens: {action.tokens.toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Child Agent Summary */}
      {childAgents.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}>
          <h4 className="text-sm font-semibold text-primary mb-3">Child Agent Summary</h4>
          <div className="grid grid-cols-4 gap-3">
            <div className="stat-card">
              <div className="stat-value">{childAgents.length}</div>
              <div className="stat-label">Total Agents</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-success">{childAgents.filter(a => a.status === 'complete').length}</div>
              <div className="stat-label">Complete</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-info">{childAgents.filter(a => a.status === 'processing').length}</div>
              <div className="stat-label">Processing</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-danger">{childAgents.filter(a => a.status === 'stopped').length}</div>
              <div className="stat-label">Stopped</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentActivityPanel;
