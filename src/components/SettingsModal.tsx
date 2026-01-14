import React, { useState, useEffect } from 'react';
import { getFullConfig, updateConfig } from '../core/config';
import type { AppConfig } from '../core/types';
import { FileSelector, invalidateFileCache } from './FileSelector';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<AppConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'workers' | 'autosave' | 'planning' | 'review' | 'stages'>('workers');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const config = getFullConfig();
    // Deep clone and ensure review config exists
    const clonedConfig = JSON.parse(JSON.stringify(config));
    if (!clonedConfig.review) {
      clonedConfig.review = {
        defaultReviewFiles: [
          'review/code-review.md',
          'review/architecture-review.md',
          'review/security-review.md'
        ]
      };
    }
    setSettings(clonedConfig);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    
    setIsSaving(true);
    try {
      updateConfig(settings);
      // Invalidate file cache so it refreshes with new settings
      invalidateFileCache();
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlanningFilesChange = (files: string[]) => {
    if (!settings) return;
    setSettings({
      ...settings,
      planning: {
        ...settings.planning,
        defaultPlanningFiles: files
      }
    });
  };

  const handleReviewFilesChange = (files: string[]) => {
    if (!settings) return;
    setSettings({
      ...settings,
      review: {
        ...settings.review,
        defaultReviewFiles: files
      }
    });
  };

  if (!settings) {
    return (
      <div className="modal-overlay">
        <div className="p-8 rounded-xl" style={{ background: 'var(--bg-card)' }}>
          <div className="animate-spin w-8 h-8 border-4 border-[var(--accent-primary)] border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-muted hover:text-primary"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            onClick={() => setActiveTab('workers')}
            className={`tab ${activeTab === 'workers' ? 'tab-active' : ''}`}
          >
            Workers
          </button>
          <button
            onClick={() => setActiveTab('autosave')}
            className={`tab ${activeTab === 'autosave' ? 'tab-active' : ''}`}
          >
            Auto-Save
          </button>
          <button
            onClick={() => setActiveTab('planning')}
            className={`tab ${activeTab === 'planning' ? 'tab-active' : ''}`}
          >
            Planning
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`tab ${activeTab === 'review' ? 'tab-active' : ''}`}
          >
            Review
          </button>
          <button
            onClick={() => setActiveTab('stages')}
            className={`tab ${activeTab === 'stages' ? 'tab-active' : ''}`}
          >
            Stage Models
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {activeTab === 'workers' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Worker Count
                </label>
                <input
                  type="number"
                  value={settings.workers.count}
                  onChange={(e) => setSettings({
                    ...settings,
                    workers: { ...settings.workers, count: parseInt(e.target.value) || 1 }
                  })}
                  min={1}
                  max={10}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs text-muted">Number of parallel AI workers (1-10)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Lock Timeout (seconds)
                </label>
                <input
                  type="number"
                  value={settings.workers.lockTimeoutSeconds}
                  onChange={(e) => setSettings({
                    ...settings,
                    workers: { ...settings.workers, lockTimeoutSeconds: parseInt(e.target.value) || 120 }
                  })}
                  min={30}
                  max={600}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs text-muted">How long a file lock can be held before timing out</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Max Turn Count
                </label>
                <input
                  type="number"
                  value={settings.workers.maxTurnCount}
                  onChange={(e) => setSettings({
                    ...settings,
                    workers: { ...settings.workers, maxTurnCount: parseInt(e.target.value) || 10 }
                  })}
                  min={1}
                  max={50}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs text-muted">Maximum turns before requiring human approval</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Context Summarize Threshold (%)
                </label>
                <input
                  type="number"
                  value={settings.context.summarizeThresholdPercent}
                  onChange={(e) => setSettings({
                    ...settings,
                    context: { ...settings.context, summarizeThresholdPercent: parseInt(e.target.value) || 80 }
                  })}
                  min={50}
                  max={95}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs text-muted">Trigger context summarization when this % of context window is used</p>
              </div>
            </div>
          )}

          {activeTab === 'autosave' && (
            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSave?.enabled ?? true}
                    onChange={(e) => setSettings({
                      ...settings,
                      autoSave: { 
                        ...settings.autoSave, 
                        enabled: e.target.checked,
                        intervalSeconds: settings.autoSave?.intervalSeconds ?? 10,
                        filePath: settings.autoSave?.filePath ?? 'data/tasks.json'
                      }
                    })}
                    className="w-4 h-4 rounded accent-[var(--accent-primary)]"
                  />
                  <span className="text-sm font-medium text-primary">Enable Auto-Save</span>
                </label>
                <p className="mt-1 ml-7 text-xs text-muted">
                  Automatically save tasks at regular intervals
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Save Interval (seconds)
                </label>
                <input
                  type="number"
                  value={settings.autoSave?.intervalSeconds ?? 10}
                  onChange={(e) => setSettings({
                    ...settings,
                    autoSave: { 
                      ...settings.autoSave, 
                      enabled: settings.autoSave?.enabled ?? true,
                      intervalSeconds: parseInt(e.target.value) || 10,
                      filePath: settings.autoSave?.filePath ?? 'data/tasks.json'
                    }
                  })}
                  min={5}
                  max={300}
                  className="w-full px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs text-muted">How often to auto-save tasks (5-300 seconds)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Save File Path
                </label>
                <input
                  type="text"
                  value={settings.autoSave?.filePath ?? 'data/tasks.json'}
                  onChange={(e) => setSettings({
                    ...settings,
                    autoSave: { 
                      ...settings.autoSave, 
                      enabled: settings.autoSave?.enabled ?? true,
                      intervalSeconds: settings.autoSave?.intervalSeconds ?? 10,
                      filePath: e.target.value || 'data/tasks.json'
                    }
                  })}
                  className="w-full px-3 py-2 rounded-lg font-mono text-sm"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                />
                <p className="mt-1 text-xs text-muted">Path where tasks will be saved (also saved to localStorage as backup)</p>
              </div>

              <div 
                className="p-4 rounded-lg"
                style={{ background: 'rgba(0,191,166,0.1)', border: '1px solid var(--accent-primary)' }}
              >
                <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--accent-primary)' }}>How Auto-Save Works</h4>
                <p className="text-xs text-secondary">
                  Tasks are automatically saved at the configured interval. A countdown timer in the header shows when the next save will occur.
                  You can also click "Save Now" to save immediately. Tasks are restored automatically when you reload the page.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'planning' && (
            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.planning.autoApprove}
                    onChange={(e) => setSettings({
                      ...settings,
                      planning: { ...settings.planning, autoApprove: e.target.checked }
                    })}
                    className="w-4 h-4 rounded accent-[var(--accent-primary)]"
                  />
                  <span className="text-sm font-medium text-primary">Auto-approve Planning</span>
                </label>
                <p className="mt-1 ml-7 text-xs text-muted">
                  Skip human approval for the planning stage
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Default Planning Files
                </label>
                <p className="text-xs text-muted mb-3">
                  Select the instruction files that will be pre-selected when creating a new task.
                </p>
                
                <FileSelector
                  type="planning"
                  selectedFiles={settings.planning.defaultPlanningFiles || []}
                  onSelectionChange={handlePlanningFilesChange}
                  maxHeight="280px"
                />
              </div>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Default Review Agents
                </label>
                <p className="text-xs text-muted mb-3">
                  Select the review agents that will be pre-selected when starting a review. Each file spawns a separate AI reviewer.
                </p>
                
                <FileSelector
                  type="review"
                  selectedFiles={settings.review?.defaultReviewFiles || []}
                  onSelectionChange={handleReviewFilesChange}
                  maxHeight="280px"
                />
              </div>

              <div 
                className="p-4 rounded-lg"
                style={{ background: 'rgba(255,161,22,0.1)', border: '1px solid var(--accent-orange)' }}
              >
                <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--accent-orange)' }}>How Review Agents Work</h4>
                <p className="text-xs text-secondary">
                  Unlike planning (which combines all files into one prompt), each review file creates a separate AI reviewer. 
                  This allows specialized reviews for code quality, architecture, security, etc. All reviews run in parallel 
                  and their results are synthesized for the approval stage.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'stages' && (
            <div className="space-y-4">
              <p className="text-sm text-muted mb-4">
                Configure the AI model for each processing stage. Changes here affect future task processing.
              </p>
              
              {Object.entries(settings.stages).map(([stageName, stageConfig]) => (
                <div 
                  key={stageName} 
                  className="p-4 rounded-lg"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
                >
                  <h3 className="font-medium text-primary capitalize mb-3">{stageName}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Provider</label>
                      <select
                        value={stageConfig.provider}
                        onChange={(e) => setSettings({
                          ...settings,
                          stages: {
                            ...settings.stages,
                            [stageName]: { ...stageConfig, provider: e.target.value as 'openai' | 'anthropic' }
                          }
                        })}
                        className="w-full px-2 py-1.5 text-sm rounded"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Model</label>
                      <input
                        type="text"
                        value={stageConfig.model}
                        onChange={(e) => setSettings({
                          ...settings,
                          stages: {
                            ...settings.stages,
                            [stageName]: { ...stageConfig, model: e.target.value }
                          }
                        })}
                        className="w-full px-2 py-1.5 text-sm rounded"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted mb-1">API Key</label>
                      <input
                        type="password"
                        value={stageConfig.apiKey}
                        onChange={(e) => setSettings({
                          ...settings,
                          stages: {
                            ...settings.stages,
                            [stageName]: { ...stageConfig, apiKey: e.target.value }
                          }
                        })}
                        className="w-full px-2 py-1.5 text-sm font-mono rounded"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Max Context Tokens</label>
                      <input
                        type="number"
                        value={stageConfig.maxContextTokens}
                        onChange={(e) => setSettings({
                          ...settings,
                          stages: {
                            ...settings.stages,
                            [stageName]: { ...stageConfig, maxContextTokens: parseInt(e.target.value) || 128000 }
                          }
                        })}
                        className="w-full px-2 py-1.5 text-sm rounded"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`btn ${isSaving ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'}`}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
