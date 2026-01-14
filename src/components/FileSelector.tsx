import React, { useState, useEffect } from 'react';

export interface AvailableFile {
  path: string;
  name: string;
  category: string;
}

interface FileSelectorProps {
  type: 'planning' | 'review' | 'other';
  selectedFiles: string[];
  onSelectionChange: (files: string[]) => void;
  showHeader?: boolean;
  maxHeight?: string;
}

// Known instruction file directories - will be discovered from filesystem
export const KNOWN_DIRECTORIES = {
  planning: ['plan'],
  review: ['review'],
  other: ['summarize', 'select', 'distribute', 'work', 'continue', 'backlog', 'approval']
};

// Primary directories shown first, others go to "Other" category
export const PRIMARY_DIRECTORIES = {
  planning: ['plan'],
  review: ['review'],
  other: ['summarize', 'select', 'distribute', 'work', 'continue', 'backlog', 'approval']
};

// File cache to avoid repeated discovery
const fileCache: {
  planning: AvailableFile[] | null;
  review: AvailableFile[] | null;
  other: AvailableFile[] | null;
  lastUpdated: number | null;
} = {
  planning: null,
  review: null,
  other: null,
  lastUpdated: null
};

// Event listeners for cache invalidation
const cacheListeners: Set<() => void> = new Set();

export function addFileCacheListener(callback: () => void): () => void {
  cacheListeners.add(callback);
  return () => cacheListeners.delete(callback);
}

function notifyCacheListeners(): void {
  cacheListeners.forEach(cb => cb());
}

// Invalidate the file cache - call this when settings change
export function invalidateFileCache(): void {
  fileCache.planning = null;
  fileCache.review = null;
  fileCache.other = null;
  fileCache.lastUpdated = null;
  notifyCacheListeners();
}

// Get cached files if available
export function getCachedFiles(type: 'planning' | 'review' | 'other'): AvailableFile[] | null {
  return fileCache[type];
}

// Check if cache is valid
export function isCacheValid(): boolean {
  return fileCache.planning !== null && fileCache.review !== null && fileCache.other !== null;
}

// File discovery - fetches available .md files from the directories
export async function discoverInstructionFiles(type: 'planning' | 'review' | 'other', forceRefresh = false): Promise<AvailableFile[]> {
  // Return cached files if available and not forcing refresh
  if (!forceRefresh && fileCache[type]) {
    return fileCache[type]!;
  }

  console.log(`[FileSelector] Discovering ${type} files (forceRefresh: ${forceRefresh})...`);
  const directories = KNOWN_DIRECTORIES[type];
  const files: AvailableFile[] = [];
  let apiAvailable = false;
  
  for (const dir of directories) {
    try {
      // Try to fetch the directory listing via the backend API (uses Vite proxy)
      const response = await fetch(`/api/files/${dir}`);
      if (response.ok) {
        apiAvailable = true;
        const data = await response.json();
        if (data.success && data.files) {
          for (const file of data.files) {
            if (file.endsWith('.md')) {
              // For 'other' type, categorize by the actual directory name
              // For 'planning' and 'review', use the directory name as category
              files.push({
                path: `${dir}/${file}`,
                name: file.replace('.md', '').replace(/-/g, ' '),
                category: dir
              });
            }
          }
          console.log(`[FileSelector] Found ${data.files.filter((f: string) => f.endsWith('.md')).length} .md files in ${dir}`);
        }
      }
    } catch (err) {
      // Log the error but continue trying other directories
      console.warn(`[FileSelector] Could not fetch files from ${dir}:`, err);
    }
  }
  
  // If no files discovered from API, use fallback known files
  // But only if the API wasn't available at all
  const result = (!apiAvailable || files.length === 0) ? getFallbackFiles(type) : files;
  
  console.log(`[FileSelector] Discovered ${result.length} ${type} files${!apiAvailable ? ' (using fallback)' : ''}`);
  
  // Cache the result
  fileCache[type] = result;
  fileCache.lastUpdated = Date.now();
  
  return result;
}

// Pre-load all files on app startup
export async function preloadAllFiles(): Promise<void> {
  await Promise.all([
    discoverInstructionFiles('planning', true),
    discoverInstructionFiles('review', true),
    discoverInstructionFiles('other', true)
  ]);
  console.log('File discovery complete - files cached');
}

// Fallback files when API is not available
export function getFallbackFiles(type: 'planning' | 'review' | 'other'): AvailableFile[] {
  if (type === 'planning') {
    return [
      // Primary planning files only
      { path: 'plan/requirements-analysis.md', name: 'Requirements Analysis', category: 'plan' },
      { path: 'plan/architecture-design.md', name: 'Architecture Design', category: 'plan' },
    ];
  } else if (type === 'review') {
    return [
      { path: 'review/code-review.md', name: 'Code Review', category: 'review' },
      { path: 'review/architecture-review.md', name: 'Architecture Review', category: 'review' },
      { path: 'review/security-review.md', name: 'Security Review', category: 'review' },
    ];
  } else {
    // Other instruction files - categorized by folder
    return [
      { path: 'summarize/instructions.md', name: 'Instructions', category: 'summarize' },
      { path: 'select/file-selection.md', name: 'File Selection', category: 'select' },
      { path: 'select/scope-validation.md', name: 'Scope Validation', category: 'select' },
      { path: 'distribute/resource-allocation.md', name: 'Resource Allocation', category: 'distribute' },
      { path: 'distribute/work-assignment.md', name: 'Work Assignment', category: 'distribute' },
      { path: 'work/implementation.md', name: 'Implementation', category: 'work' },
      { path: 'work/quality-assurance.md', name: 'Quality Assurance', category: 'work' },
      { path: 'continue/README.md', name: 'Continue Instructions', category: 'continue' },
      { path: 'approval/final-approval.md', name: 'Final Approval', category: 'approval' },
    ];
  }
}

export const FileSelector: React.FC<FileSelectorProps> = ({
  type,
  selectedFiles,
  onSelectionChange,
  showHeader = true,
  maxHeight = '300px'
}) => {
  const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadFiles = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      const files = await discoverInstructionFiles(type, forceRefresh);
      setAvailableFiles(files);
      if (forceRefresh) {
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Error discovering files:', error);
      setAvailableFiles(getFallbackFiles(type));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // Load from cache or discover
    loadFiles(false);
    
    // Listen for cache invalidation
    const unsubscribe = addFileCacheListener(() => {
      loadFiles(true);
    });
    
    return unsubscribe;
  }, [type]);

  const handleRefresh = () => {
    loadFiles(true);
  };

  const handleToggleFile = (filePath: string) => {
    if (selectedFiles.includes(filePath)) {
      onSelectionChange(selectedFiles.filter(f => f !== filePath));
    } else {
      onSelectionChange([...selectedFiles, filePath]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(availableFiles.map(f => f.path));
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

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

  const accentColor = type === 'planning' ? 'var(--purple)' : type === 'review' ? 'var(--accent-orange)' : 'var(--accent-primary)';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: accentColor, borderTopColor: 'transparent' }}></div>
        <span className="ml-3 text-muted">Discovering available files...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-secondary">
              {selectedFiles.length} of {availableFiles.length} files selected
            </span>
            {lastRefresh && (
              <span className="text-xs text-muted">
                (refreshed {lastRefresh.toLocaleTimeString()})
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-[var(--bg-elevated)] transition-colors"
              title="Refresh file list from filesystem"
              disabled={isLoading}
              style={{ color: accentColor }}
            >
              <svg 
                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
            <span className="text-muted">|</span>
            <button
              onClick={handleSelectAll}
              className="text-sm hover:underline"
              style={{ color: accentColor }}
            >
              Select All
            </button>
            <span className="text-muted">|</span>
            <button
              onClick={handleClearAll}
              className="text-sm hover:underline"
              style={{ color: accentColor }}
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full py-2 text-sm rounded-lg bg-[var(--bg-elevated)] text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
          style={{ 
            border: '1px solid var(--border-secondary)', 
            paddingLeft: '2rem',
            paddingRight: '2rem'
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* File List */}
      <div 
        className="space-y-4 overflow-y-auto pr-2"
        style={{ maxHeight }}
      >
        {Object.keys(groupedFiles).length === 0 ? (
          <div className="text-center py-8 text-muted">
            <p>No files found matching "{searchQuery}"</p>
          </div>
        ) : (
          Object.entries(groupedFiles)
            // Sort so primary categories come first, 'other' comes last
            .sort(([a], [b]) => {
              if (a === 'other') return 1;
              if (b === 'other') return -1;
              return a.localeCompare(b);
            })
            .map(([category, files]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-4 h-px" style={{ background: accentColor }}></span>
                {category === 'other' ? 'Other Instructions' : category}
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
                        className="w-4 h-4 rounded"
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
    </div>
  );
};
