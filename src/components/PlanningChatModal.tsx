import React, { useState, useRef, useEffect } from 'react';
import type { Task } from '../core/types';
import { approvePlanning, requestPlanningChanges, rejectHumanGate } from '../core/TaskStore';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PlanningChatModalProps {
  task: Task;
  onClose: () => void;
}

export const PlanningChatModal: React.FC<PlanningChatModalProps> = ({ task, onClose }) => {
  const [message, setMessage] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

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

  // Scroll to bottom when chat updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [task.planningChat]);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    requestPlanningChanges(task.id, message.trim());
    setMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleApprove = () => {
    approvePlanning(task.id);
    onClose();
  };

  const handleReject = () => {
    if (showRejectInput) {
      rejectHumanGate(task.id, rejectReason || 'Planning rejected by human');
      onClose();
    } else {
      setShowRejectInput(true);
    }
  };

  const isWaitingForAI = task.status === 'processing' || task.status === 'active';
  const lastMessage = task.planningChat[task.planningChat.length - 1];
  const canSendMessage = lastMessage?.role === 'assistant' && !isWaitingForAI;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px' }}>
        {/* Header */}
        <div 
          className="p-6"
          style={{ 
            background: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, transparent 100%)',
            borderBottom: '1px solid var(--border-secondary)'
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">📋</span>
            <div>
              <h2 className="text-xl font-bold text-primary">Planning Review</h2>
              <p className="text-sm text-muted mt-1">
                Review and discuss the proposed plan before proceeding
              </p>
            </div>
          </div>
        </div>

        {/* Task Info */}
        <div className="p-4" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-secondary)' }}>
          <h3 className="font-semibold text-primary">{task.title}</h3>
          <p className="text-sm text-muted mt-1">{task.description}</p>
        </div>

        {/* Chat Container */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[400px]"
          style={{ background: 'var(--bg-primary)' }}
        >
          {task.planningChat.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-4 border-[var(--purple)] border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Waiting for AI planning response...</p>
              </div>
            </div>
          ) : (
            task.planningChat.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[80%] rounded-lg p-4"
                  style={{
                    background: msg.role === 'user' ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                    color: msg.role === 'user' ? 'var(--bg-primary)' : 'var(--text-primary)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium opacity-75">
                      {msg.role === 'user' ? '👤 You' : '🤖 AI Planner'}
                    </span>
                    <span className="text-xs opacity-50">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm markdown-content">
                    <MarkdownRenderer content={msg.content} />
                  </div>
                </div>
              </div>
            ))
          )}
          
          {isWaitingForAI && task.planningChat.length > 0 && (
            <div className="flex justify-start">
              <div className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-2">
                  <div className="animate-pulse flex gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }}></span>
                    <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }}></span>
                    <span className="w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }}></span>
                  </div>
                  <span className="text-sm text-muted">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Reject Reason Input */}
        {showRejectInput && (
          <div className="p-4" style={{ background: 'rgba(239,71,67,0.1)', borderTop: '1px solid var(--border-secondary)' }}>
            <label className="block text-sm font-medium text-secondary mb-2">
              Rejection Reason (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--danger)', color: 'var(--text-primary)' }}
              autoFocus
            />
          </div>
        )}

        {/* Message Input */}
        {!showRejectInput && (
          <div className="p-4" style={{ borderTop: '1px solid var(--border-secondary)' }}>
            <div className="flex gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  canSendMessage
                    ? "Type your feedback or questions about the plan..."
                    : "Waiting for AI response..."
                }
                disabled={!canSendMessage}
                rows={3}
                className="flex-1 px-3 py-2 rounded-lg outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!canSendMessage || !message.trim()}
                className={`btn self-end ${!canSendMessage || !message.trim() ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'}`}
              >
                Send
              </button>
            </div>
            <p className="text-xs text-muted mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="modal-footer">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Close
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              className="btn btn-danger"
            >
              {showRejectInput ? 'Confirm Reject' : 'Reject Plan'}
            </button>
            {showRejectInput && (
              <button
                onClick={() => setShowRejectInput(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleApprove}
              disabled={task.planningChat.length === 0 || isWaitingForAI}
              className={`btn ${task.planningChat.length === 0 || isWaitingForAI ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-success'}`}
            >
              Approve Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
