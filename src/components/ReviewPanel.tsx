import React, { useState } from 'react';
import type { Task } from '../core/types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ReviewPanelProps {
  task: Task;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ task }) => {
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  const getVerdictBadgeClass = (verdict: string): string => {
    const classes: Record<string, string> = {
      approve: 'badge-success',
      'request-changes': 'badge-warning',
      reject: 'badge-danger'
    };
    return classes[verdict] || 'badge-muted';
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-danger';
  };

  const toggleReview = (index: number) => {
    setExpandedReview(expandedReview === index ? null : index);
  };

  // Helper to extract agent name from instruction file path
  const getAgentName = (instructionFile: string): string => {
    // Extract filename without extension: "review/code-review.md" -> "code-review"
    const filename = instructionFile.split('/').pop()?.replace('.md', '') || 'Unknown';
    // Convert to title case: "code-review" -> "Code Review"
    return filename
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (task.reviews.length === 0 && !task.reviewSynthesis) {
    return (
      <div className="text-center py-12 text-muted">
        <div className="text-3xl mb-2 opacity-50">📝</div>
        <p>No reviews yet</p>
        <p className="text-sm mt-1">Reviews will appear here once the task reaches the review stage</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review Synthesis */}
      {task.reviewSynthesis && (
        <div 
          className="p-4 rounded-lg"
          style={{ 
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(168,85,247,0.1) 100%)',
            border: '1px solid var(--purple)'
          }}
        >
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--purple)' }}>
            <span>📊</span>
            Combined Review Synthesis
          </h3>
          <div className="markdown-content">
            <MarkdownRenderer content={task.reviewSynthesis} />
          </div>
        </div>
      )}

      {/* Individual Reviews */}
      {task.reviews.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-secondary mb-3">
            Individual Reviews ({task.reviews.length})
          </h3>
          <div className="space-y-3">
            {task.reviews.map((review, index) => (
              <div
                key={`${review.reviewerId}-${index}`}
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--border-secondary)' }}
              >
                {/* Review Header - Always visible */}
                <button
                  onClick={() => toggleReview(index)}
                  className="w-full p-4 hover:bg-[var(--bg-card-hover)] transition-colors flex items-center justify-between"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {review.verdict === 'approve' ? '✅' :
                       review.verdict === 'reject' ? '❌' : '⚠️'}
                    </span>
                    <div className="text-left">
                      <div className="font-medium text-primary">
                        {getAgentName(review.instructionFile)}
                      </div>
                      <div className="text-xs text-muted">
                        {review.instructionFile}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${getVerdictBadgeClass(review.verdict)}`}>
                      {review.verdict}
                    </span>
                    <span className={`text-lg font-bold ${getScoreColor(review.score)}`}>
                      {review.score}
                    </span>
                    <svg
                      className={`w-5 h-5 text-muted transition-transform ${
                        expandedReview === index ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Review Content - Expandable */}
                {expandedReview === index && (
                  <div className="p-4" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-secondary)' }}>
                    <div className="text-xs text-muted mb-2">
                      Reviewed at: {new Date(review.timestamp).toLocaleString()}
                    </div>
                    <div 
                      className="p-3 rounded text-sm markdown-content"
                      style={{ background: 'var(--bg-elevated)' }}
                    >
                      <MarkdownRenderer content={review.output} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Stats Summary */}
      {task.reviews.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="stat-card text-center">
            <div className="stat-value text-success">
              {task.reviews.filter(r => r.verdict === 'approve').length}
            </div>
            <div className="stat-label">Approvals</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value text-warning">
              {task.reviews.filter(r => r.verdict === 'request-changes').length}
            </div>
            <div className="stat-label">Changes Requested</div>
          </div>
          <div className="stat-card text-center">
            <div className="stat-value text-danger">
              {task.reviews.filter(r => r.verdict === 'reject').length}
            </div>
            <div className="stat-label">Rejections</div>
          </div>
        </div>
      )}
    </div>
  );
};
