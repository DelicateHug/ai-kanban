import React, { useState, useEffect, useMemo } from 'react';
import { useTaskStore } from '../core/TaskStore';
import { useProjectStore } from '../core/ProjectStore';
import { getDefaultPlanningFiles, getDefaultReviewFiles, getDefaultMcpServers } from '../core/config';
import { getFallbackFiles, type AvailableFile } from './FileSelector';
import type { Stage } from '../core/types';

// Available MCP servers
export const MCP_SERVERS = [
  'filesystem',
  'terminal',
  'browser',
  'database',
  'git',
  'docker',
];

// Stages that make sense for initial task creation
const INITIAL_STAGES: { value: Stage; label: string; icon: string }[] = [
  { value: 'create', label: 'Ready to Start', icon: '✨' },
  { value: 'backlog', label: 'Backlog', icon: '📋' },
  { value: 'plan', label: 'Planning', icon: '📐' },
  { value: 'select', label: 'Select Files', icon: '📁' },
];

interface CreateTaskModalProps {
  onClose: () => void;
  defaultProjectId?: string | null; // Pre-select a project
  simpleMode?: boolean; // Simple mode from parent
  autoStartTasks?: boolean; // Auto start from parent
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ 
  onClose, 
  defaultProjectId,
  simpleMode = false,
  autoStartTasks = false 
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPlanningFiles, setSelectedPlanningFiles] = useState<string[]>([]);
  const [selectedReviewFiles, setSelectedReviewFiles] = useState<string[]>([]);
  const [selectedMcpServers, setSelectedMcpServers] = useState<string[]>([]);
  const [showPlanningFiles, setShowPlanningFiles] = useState(false);
  const [showReviewFiles, setShowReviewFiles] = useState(false);
  const [showMcpServers, setShowMcpServers] = useState(false);
  const [skipPlanning, setSkipPlanning] = useState(simpleMode);
  // skipSelect is automatically set when simpleMode is true - no UI control needed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [skipSelect, _setSkipSelect] = useState(simpleMode);
  const [skipDistribute, setSkipDistribute] = useState(simpleMode);
  const [skipReview, setSkipReview] = useState(simpleMode);
  const [planningFiles, setPlanningFiles] = useState<AvailableFile[]>([]);
  const [reviewFiles, setReviewFiles] = useState<AvailableFile[]>([]);
  const [searchPlanningQuery, setSearchPlanningQuery] = useState('');
  const [searchReviewQuery, setSearchReviewQuery] = useState('');
  const [initialStage, setInitialStage] = useState<Stage>(autoStartTasks ? (simpleMode ? 'select' : 'plan') : 'create');
  
  // Project and sandbox settings
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(defaultProjectId ?? null);
  const [allowExternalAccess, setAllowExternalAccess] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);

  const createTask = useTaskStore((state) => state.createTask);
  const projectsMap = useProjectStore((state) => state.projects);
  const projects = useMemo(() => 
    Array.from(projectsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap]
  );
  const selectedProject = useProjectStore((state) => 
    selectedProjectId ? state.getProject(selectedProjectId) : null
  );

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

  // Handle auto-start tasks - set initial stage based on skip options
  useEffect(() => {
    if (autoStartTasks) {
      if (skipPlanning && skipSelect) {
        // If skipping both planning and select, start at work stage
        setInitialStage('work');
      } else if (skipPlanning) {
        setInitialStage('select');
      } else {
        setInitialStage('plan');
      }
    } else {
      // When auto-start is disabled, reset to create stage
      setInitialStage('create');
    }
  }, [autoStartTasks, skipPlanning, skipSelect]);

  // Initialize with default files from settings and load available files
  useEffect(() => {
    setSelectedPlanningFiles(getDefaultPlanningFiles());
    setSelectedReviewFiles(getDefaultReviewFiles());
    setSelectedMcpServers(getDefaultMcpServers());
    
    // Load available files
    const loadFiles = async () => {
      // Try to fetch from API first, fallback to known files
      try {
        const planningResponse = await fetch('/api/instruction-files/planning');
        if (planningResponse.ok) {
          const data = await planningResponse.json();
          setPlanningFiles(data.files || []);
        } else {
          setPlanningFiles(getFallbackFiles('planning'));
        }
      } catch {
        setPlanningFiles(getFallbackFiles('planning'));
      }

      try {
        const reviewResponse = await fetch('/api/instruction-files/review');
        if (reviewResponse.ok) {
          const data = await reviewResponse.json();
          setReviewFiles(data.files || []);
        } else {
          setReviewFiles(getFallbackFiles('review'));
        }
      } catch {
        setReviewFiles(getFallbackFiles('review'));
      }
    };
    loadFiles();
  }, []);

  const handleTogglePlanningFile = (file: string) => {
    setSelectedPlanningFiles(prev => 
      prev.includes(file) 
        ? prev.filter(f => f !== file)
        : [...prev, file]
    );
  };

  const handleToggleReviewFile = (file: string) => {
    setSelectedReviewFiles(prev => 
      prev.includes(file) 
        ? prev.filter(f => f !== file)
        : [...prev, file]
    );
  };

  const handleToggleMcpServer = (server: string) => {
    setSelectedMcpServers(prev => 
      prev.includes(server) 
        ? prev.filter(s => s !== server)
        : [...prev, server]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    
    try {
      createTask(
        title.trim(), 
        description.trim(), 
        selectedPlanningFiles, 
        selectedReviewFiles, 
        selectedMcpServers, 
        skipPlanning,
        skipSelect,
        skipDistribute, 
        skipReview,
        selectedProjectId ?? undefined,
        allowExternalAccess,
        initialStage
      );
      onClose();
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Create New Task</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg transition-colors text-muted hover:text-primary"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="modal-body space-y-4">
          {/* Mode indicator */}
          {simpleMode && (
            <div 
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(42,196,140,0.1)', border: '1px solid var(--accent-primary)' }}
            >
              <span>🚀</span>
              <span className="text-primary">Simple Mode - skipping planning, file selection, distribution, and review stages</span>
            </div>
          )}
          
          {autoStartTasks && (
            <div 
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid var(--purple)' }}
            >
              <span>⚡</span>
              <span className="text-primary">Auto Start - task will begin in <strong>{skipPlanning && skipSelect ? 'Work' : skipPlanning ? 'Select' : 'Plan'}</strong> stage</span>
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-secondary mb-1">
              Title <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title..."
              className="w-full px-3 py-2 rounded-lg outline-none transition-colors"
              style={{ 
                background: 'var(--bg-elevated)', 
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)'
              }}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-secondary mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task in detail..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg outline-none transition-colors resize-none"
              style={{ 
                background: 'var(--bg-elevated)', 
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Initial Stage Selection */}
          {!autoStartTasks && (
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                Initial Stage
              </label>
              <div className="flex gap-2 flex-wrap">
                {INITIAL_STAGES
                  .filter(({ value }) => {
                    // Hide select stage if not skipping planning
                    if (value === 'select' && !skipPlanning) return false;
                    // Hide plan stage if skipping planning
                    if (value === 'plan' && skipPlanning) return false;
                    return true;
                  })
                  .map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setInitialStage(value)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      initialStage === value 
                        ? 'ring-2 ring-[var(--accent-primary)]' 
                        : 'hover:bg-[var(--bg-secondary)]'
                    }`}
                    style={{ 
                      background: initialStage === value ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: '1px solid var(--border-secondary)',
                      color: initialStage === value ? '#000' : 'var(--text-primary)'
                    }}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-1">
                {initialStage === 'backlog' 
                  ? 'Task will be saved for later in the backlog' 
                  : initialStage === 'plan'
                  ? 'Task will start planning immediately'
                  : initialStage === 'select'
                  ? 'Task will skip planning and start with file selection'
                  : 'Task will be ready to start'}
              </p>
            </div>
          )}

          {/* Project Selection */}
          <div>
            <button
              type="button"
              onClick={() => setShowProjectSelector(!showProjectSelector)}
              className="flex items-center gap-2 text-sm font-medium text-secondary hover:text-accent transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${showProjectSelector ? 'rotate-90' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              📁 Project {selectedProject ? `(${selectedProject.name})` : '(None - Global)'}
            </button>
            
            {showProjectSelector && (
              <div 
                className="mt-3 p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-primary)' }}
              >
                <p className="text-xs text-muted mb-3">
                  Associate this task with a project. MCP tools will be sandboxed to the project folder.
                </p>
                
                {/* No Project Option */}
                <label 
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-2 ${
                    !selectedProjectId ? 'bg-[rgba(42,196,140,0.15)]' : 'hover:bg-[var(--bg-card-hover)]'
                  }`}
                  style={{ border: !selectedProjectId ? '1px solid var(--accent-primary)' : '1px solid transparent' }}
                >
                  <input
                    type="radio"
                    name="project"
                    checked={!selectedProjectId}
                    onChange={() => setSelectedProjectId(null)}
                    className="w-4 h-4 accent-[var(--accent-primary)]"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🌐</span>
                    <div>
                      <div className="text-sm font-medium text-primary">No Project (Global)</div>
                      <div className="text-xs text-muted">Full access to all files</div>
                    </div>
                  </div>
                </label>

                {/* Project Options */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {projects.map((project) => (
                    <label 
                      key={project.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                        selectedProjectId === project.id ? 'bg-[rgba(42,196,140,0.15)]' : 'hover:bg-[var(--bg-card-hover)]'
                      }`}
                      style={{ 
                        border: selectedProjectId === project.id ? `1px solid ${project.color}` : '1px solid transparent'
                      }}
                    >
                      <input
                        type="radio"
                        name="project"
                        checked={selectedProjectId === project.id}
                        onChange={() => setSelectedProjectId(project.id)}
                        className="w-4 h-4"
                        style={{ accentColor: project.color }}
                      />
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
                        style={{ background: `${project.color}20` }}
                      >
                        {project.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-primary truncate">{project.name}</div>
                        <div className="text-xs text-muted truncate">{project.path}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {projects.length === 0 && (
                  <p className="text-sm text-muted text-center py-4">
                    No projects yet. Create a project from the overview page.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Allow External Access Toggle - Always visible when project is selected */}
          {selectedProjectId && (
            <div 
              className="p-4 rounded-lg"
              style={{ 
                background: allowExternalAccess ? 'rgba(251,191,36,0.1)' : 'var(--bg-elevated)', 
                border: allowExternalAccess ? '1px solid var(--warning)' : '1px solid var(--border-secondary)' 
              }}
            >
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowExternalAccess}
                  onChange={(e) => setAllowExternalAccess(e.target.checked)}
                  className="w-5 h-5 rounded accent-[var(--warning)]"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-primary flex items-center gap-2">
                    {allowExternalAccess ? '🔓' : '🔒'} External Access
                    {allowExternalAccess ? (
                      <span 
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: 'rgba(251,191,36,0.2)', color: 'var(--warning)' }}
                      >
                        ENABLED
                      </span>
                    ) : (
                      <span 
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: 'rgba(42,196,140,0.2)', color: 'var(--success)' }}
                      >
                        SANDBOXED
                      </span>
                    )}
                  </span>
                  <p className="text-xs text-muted mt-1">
                    {allowExternalAccess 
                      ? 'MCP tools can access files outside the project folder (less secure)' 
                      : `MCP tools are restricted to ${selectedProject?.name || 'project'} folder only`}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Planning Files Selection */}
          <div>
            <button
              type="button"
              onClick={() => setShowPlanningFiles(!showPlanningFiles)}
              className="flex items-center gap-2 text-sm font-medium text-secondary hover:text-accent transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${showPlanningFiles ? 'rotate-90' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              📋 Planning Agents ({selectedPlanningFiles.length} selected)
            </button>
            
            {showPlanningFiles && (
              <div 
                className="mt-3 p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--purple)' }}
              >
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs text-muted">
                    Select agents for the planning stage (combined into one prompt)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPlanningFiles(planningFiles.map(f => f.path))}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--purple)' }}
                    >
                      All
                    </button>
                    <span className="text-muted">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPlanningFiles([])}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--purple)' }}
                    >
                      None
                    </button>
                  </div>
                </div>
                
                {/* Search */}
                <div className="relative mb-3">
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
                    value={searchPlanningQuery}
                    onChange={(e) => setSearchPlanningQuery(e.target.value)}
                    placeholder="Search planning files..."
                    className="w-full pl-10 pr-4 py-2 text-sm rounded-lg"
                    style={{ 
                      background: 'var(--bg-primary)', 
                      border: '1px solid var(--border-secondary)', 
                      color: 'var(--text-primary)' 
                    }}
                  />
                </div>
                
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {planningFiles
                    .filter(file => 
                      file.name.toLowerCase().includes(searchPlanningQuery.toLowerCase()) ||
                      file.path.toLowerCase().includes(searchPlanningQuery.toLowerCase())
                    )
                    .map((file) => (
                    <label 
                      key={file.path}
                      className="flex items-center gap-2 p-2 rounded cursor-pointer transition-all"
                      style={{ 
                        background: selectedPlanningFiles.includes(file.path) ? 'rgba(168,85,247,0.15)' : 'transparent',
                        border: selectedPlanningFiles.includes(file.path) ? '1px solid var(--purple)' : '1px solid transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlanningFiles.includes(file.path)}
                        onChange={() => handleTogglePlanningFile(file.path)}
                        className="w-4 h-4 rounded accent-[var(--purple)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-primary capitalize truncate">{file.name}</div>
                        <div className="text-xs text-muted font-mono truncate">{file.path}</div>
                      </div>
                      <span className="badge badge-muted text-xs capitalize">{file.category}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Review Files Selection */}
          <div>
            <button
              type="button"
              onClick={() => setShowReviewFiles(!showReviewFiles)}
              className="flex items-center gap-2 text-sm font-medium text-secondary hover:text-accent transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${showReviewFiles ? 'rotate-90' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              🔍 Review Agents ({selectedReviewFiles.length} selected)
            </button>
            
            {showReviewFiles && (
              <div 
                className="mt-3 p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-orange)' }}
              >
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs text-muted">
                    Select agents for review (each runs as a separate reviewer)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedReviewFiles(reviewFiles.map(f => f.path))}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--accent-orange)' }}
                    >
                      All
                    </button>
                    <span className="text-muted">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedReviewFiles([])}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--accent-orange)' }}
                    >
                      None
                    </button>
                  </div>
                </div>
                
                {/* Search */}
                <div className="relative mb-3">
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
                    value={searchReviewQuery}
                    onChange={(e) => setSearchReviewQuery(e.target.value)}
                    placeholder="Search review files..."
                    className="w-full pl-10 pr-4 py-2 text-sm rounded-lg"
                    style={{ 
                      background: 'var(--bg-primary)', 
                      border: '1px solid var(--border-secondary)', 
                      color: 'var(--text-primary)' 
                    }}
                  />
                </div>
                
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {reviewFiles
                    .filter(file => 
                      file.name.toLowerCase().includes(searchReviewQuery.toLowerCase()) ||
                      file.path.toLowerCase().includes(searchReviewQuery.toLowerCase())
                    )
                    .map((file) => (
                    <label 
                      key={file.path}
                      className="flex items-center gap-2 p-2 rounded cursor-pointer transition-all"
                      style={{ 
                        background: selectedReviewFiles.includes(file.path) ? 'rgba(255,161,22,0.15)' : 'transparent',
                        border: selectedReviewFiles.includes(file.path) ? '1px solid var(--accent-orange)' : '1px solid transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedReviewFiles.includes(file.path)}
                        onChange={() => handleToggleReviewFile(file.path)}
                        className="w-4 h-4 rounded accent-[var(--accent-orange)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-primary capitalize truncate">{file.name}</div>
                        <div className="text-xs text-muted font-mono truncate">{file.path}</div>
                      </div>
                      <span className="badge badge-muted text-xs capitalize">{file.category}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MCP Servers Selection */}
          <div>
            <button
              type="button"
              onClick={() => setShowMcpServers(!showMcpServers)}
              className="flex items-center gap-2 text-sm font-medium text-secondary hover:text-accent transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${showMcpServers ? 'rotate-90' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              🔌 Allowed MCP Servers ({selectedMcpServers.length} selected)
            </button>
            
            {showMcpServers && (
              <div 
                className="mt-3 p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--success)' }}
              >
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs text-muted">
                    Select MCP servers the AI agents can use for this task
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMcpServers([...MCP_SERVERS])}
                      className="text-xs text-accent hover:underline"
                    >
                      All
                    </button>
                    <span className="text-muted">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedMcpServers([])}
                      className="text-xs text-accent hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {MCP_SERVERS.map((server) => (
                    <label 
                      key={server}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                        selectedMcpServers.includes(server) ? 'bg-[rgba(42,196,140,0.2)]' : 'hover:bg-[var(--bg-card-hover)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMcpServers.includes(server)}
                        onChange={() => handleToggleMcpServer(server)}
                        className="w-4 h-4 rounded accent-[var(--success)]"
                      />
                      <span className="text-sm text-primary">{server}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Skip Options - Only shown in Advanced Mode */}
          {!simpleMode && (
            <>
              {/* Skip Planning Option */}
              <div 
                className="p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipPlanning}
                    onChange={(e) => setSkipPlanning(e.target.checked)}
                    className="w-5 h-5 rounded accent-[var(--accent)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-primary">⏭ Skip Planning Stage</span>
                    <p className="text-xs text-muted mt-1">
                      Go directly to file selection without AI-assisted planning
                    </p>
                  </div>
                </label>
              </div>

              {/* Skip Distribute Option - for simple tasks */}
              <div 
                className="p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDistribute}
                    onChange={(e) => setSkipDistribute(e.target.checked)}
                    className="w-5 h-5 rounded accent-[var(--warning)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-primary">🎯 Simple Task (No Sub-Agents)</span>
                    <p className="text-xs text-muted mt-1">
                      Skip distribution stage - run as single task without spawning child agents
                    </p>
                  </div>
                </label>
              </div>

              {/* Skip Review Option */}
              <div 
                className="p-4 rounded-lg"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipReview}
                    onChange={(e) => setSkipReview(e.target.checked)}
                    className="w-5 h-5 rounded accent-[var(--danger)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-primary">⚡ Skip Review Stage</span>
                    <p className="text-xs text-muted mt-1">
                      Go directly to approval without code/architecture review
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}

          <div className="text-sm text-muted">
            <p>The task will be created in the <strong className="text-primary">{
              autoStartTasks 
                ? (skipPlanning ? 'Select' : 'Plan')
                : initialStage === 'backlog' 
                  ? 'Backlog' 
                  : initialStage === 'plan' 
                    ? 'Plan' 
                    : initialStage === 'select'
                      ? 'Select'
                      : 'Create'
            }</strong> stage and automatically progress through:</p>
            <p className="mt-1 text-xs">
              {(() => {
                const startStage = autoStartTasks 
                  ? (skipPlanning && skipSelect ? 'work' : skipPlanning ? 'select' : 'plan')
                  : initialStage;
                
                const stages: string[] = [];
                if (startStage === 'backlog') {
                  stages.push('Backlog');
                }
                if (startStage === 'create' || startStage === 'backlog') {
                  stages.push('Create');
                }
                if (!skipPlanning && startStage !== 'select' && startStage !== 'work') {
                  stages.push('Plan');
                }
                if (!skipSelect && startStage !== 'work') {
                  stages.push('Select');
                }
                if (!skipDistribute) stages.push('Distribute');
                stages.push('Work');
                if (!skipReview) stages.push('Review');
                stages.push('Approval', 'Complete');
                return stages.join(' → ');
              })()}
            </p>
          </div>

          {/* Actions */}
          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className={`btn ${title.trim() && !isSubmitting ? 'btn-primary' : 'btn-ghost opacity-50 cursor-not-allowed'}`}
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
