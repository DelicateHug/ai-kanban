/**
 * CreateProjectModal - Modal for creating a new project
 * Allows user to specify project name, path, description, and visual settings
 */

import React, { useState } from 'react';
import { useProjectStore, PROJECT_COLORS, PROJECT_ICONS } from '../core/ProjectStore';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ 
  onClose,
  onCreated 
}) => {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState(PROJECT_ICONS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const createProject = useProjectStore((state) => state.createProject);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    
    if (!path.trim()) {
      setError('Project path is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Validate that path exists (optional - could be created)
      const project = createProject(
        name.trim(), 
        path.trim(), 
        description.trim(),
        selectedColor,
        selectedIcon
      );
      
      if (onCreated) {
        onCreated(project.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBrowsePath = async () => {
    // This would ideally open a folder picker
    // For now, we'll just show a hint
    setError('Enter the full path to your project folder (e.g., C:/Projects/my-app)');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Create New Project</h2>
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
        <form onSubmit={handleSubmit} className="modal-body space-y-5">
          {error && (
            <div 
              className="p-3 rounded-lg text-sm"
              style={{ background: 'rgba(239,71,67,0.15)', color: 'var(--danger)' }}
            >
              {error}
            </div>
          )}

          {/* Icon and Color Picker */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowIconPicker(!showIconPicker)}
              className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl transition-transform hover:scale-105"
              style={{ background: `${selectedColor}20`, border: `2px solid ${selectedColor}` }}
            >
              {selectedIcon}
            </button>
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary mb-2">
                Project Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                    style={{ 
                      background: color,
                      border: selectedColor === color ? '3px solid white' : 'none',
                      boxShadow: selectedColor === color ? `0 0 0 2px ${color}` : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Icon Picker Dropdown */}
          {showIconPicker && (
            <div 
              className="p-3 rounded-lg"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
            >
              <label className="block text-sm font-medium text-secondary mb-2">
                Select Icon
              </label>
              <div className="flex gap-2 flex-wrap">
                {PROJECT_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => {
                      setSelectedIcon(icon);
                      setShowIconPicker(false);
                    }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all hover:scale-110"
                    style={{ 
                      background: selectedIcon === icon ? `${selectedColor}30` : 'transparent',
                      border: selectedIcon === icon ? `2px solid ${selectedColor}` : '2px solid transparent'
                    }}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Project Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-secondary mb-1">
              Project Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Project"
              className="w-full px-3 py-2.5 rounded-lg outline-none transition-colors"
              style={{ 
                background: 'var(--bg-elevated)', 
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)'
              }}
              autoFocus
            />
          </div>

          {/* Project Path */}
          <div>
            <label htmlFor="path" className="block text-sm font-medium text-secondary mb-1">
              Project Folder Path <span className="text-danger">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:/Projects/my-project"
                className="flex-1 px-3 py-2.5 rounded-lg outline-none transition-colors"
                style={{ 
                  background: 'var(--bg-elevated)', 
                  border: '1px solid var(--border-secondary)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                type="button"
                onClick={handleBrowsePath}
                className="btn btn-ghost px-3"
                title="Browse for folder"
              >
                📂
              </button>
            </div>
            <p className="text-xs text-muted mt-1">
              MCP tools will be restricted to this folder by default
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-secondary mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your project..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg outline-none transition-colors resize-none"
              style={{ 
                background: 'var(--bg-elevated)', 
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Info Box */}
          <div 
            className="p-4 rounded-lg flex gap-3"
            style={{ background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.3)' }}
          >
            <span className="text-xl">🔒</span>
            <div className="text-sm">
              <p className="font-medium text-primary mb-1">Sandboxed by Default</p>
              <p className="text-muted">
                Tasks in this project will only be able to read/write files within the project folder. 
                You can enable external access per-task if needed.
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div 
          className="modal-footer flex justify-end gap-3"
          style={{ borderTop: '1px solid var(--border-secondary)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !path.trim()}
            className="btn btn-primary"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                Creating...
              </>
            ) : (
              <>
                <span>✨</span>
                Create Project
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;
