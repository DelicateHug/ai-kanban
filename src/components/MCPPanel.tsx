import React, { useState, useMemo } from 'react';
import { useMCPStore, type MCPServer, type MCPTool, type MCPToolExecution } from '../core/MCPManager';

interface ToolDetailsProps {
  tool: MCPTool;
  serverId: string;
}

// Helper to categorize tools by prefix or action type
const categorizeTools = (tools: MCPTool[]): Map<string, MCPTool[]> => {
  const categories = new Map<string, MCPTool[]>();
  
  const categoryPatterns: Record<string, RegExp> = {
    '📖 Read': /^(read|get|list|search|find|query|fetch|inspect)/i,
    '✏️ Write': /^(write|create|append|set|update|add|insert)/i,
    '🗑️ Delete': /^(delete|remove|clear|prune)/i,
    '📁 File Operations': /^(file|copy|move|rename)/i,
    '📂 Directory': /^(directory|dir|folder|path)/i,
    '🔄 Transform': /^(replace|convert|transform|format|tag)/i,
    '▶️ Actions': /^(run|execute|start|stop|restart|act)/i,
    '📊 Info': /^(info|status|details|logs|check|exists)/i,
  };

  tools.forEach(tool => {
    let assigned = false;
    for (const [category, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(tool.name)) {
        const existing = categories.get(category) || [];
        existing.push(tool);
        categories.set(category, existing);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      const existing = categories.get('🔧 Other') || [];
      existing.push(tool);
      categories.set('🔧 Other', existing);
    }
  });

  return categories;
};

const ToolDetails: React.FC<ToolDetailsProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  return (
    <div 
      className="rounded-lg overflow-hidden"
      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-elevated)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-info">🔧</span>
          <span className="font-medium text-sm text-primary">{tool.name}</span>
        </div>
        <span className="text-muted text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      
      {expanded && (
        <div 
          className="px-3 py-2 text-xs"
          style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-secondary)' }}
        >
          <p className="text-secondary mb-3 leading-relaxed">{tool.description || 'No description available'}</p>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSchema(!showSchema);
            }}
            className="flex items-center gap-1 text-muted hover:text-primary transition-colors text-xs"
          >
            <span>{showSchema ? '▼' : '▶'}</span>
            <span className="font-medium">Input Schema</span>
          </button>
          
          {showSchema && (
            <pre 
              className="mt-2 p-2 rounded text-xs overflow-x-auto"
              style={{ background: 'var(--bg-primary)', maxHeight: '200px' }}
            >
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

interface ToolGroupProps {
  category: string;
  tools: MCPTool[];
  serverId: string;
  defaultExpanded?: boolean;
}

const ToolGroup: React.FC<ToolGroupProps> = ({ category, tools, serverId, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div 
      className="rounded-lg overflow-hidden"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-primary">{category}</span>
          <span 
            className="text-xs font-semibold text-primary flex items-center justify-center rounded-md"
            style={{ 
              background: 'var(--bg-primary)', 
              border: '1px solid var(--border-primary)',
              minWidth: '24px',
              height: '22px',
              padding: '0 6px'
            }}
          >
            {tools.length}
          </span>
        </div>
        <span className="text-muted text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      
      {expanded && (
        <div className="p-2 space-y-1">
          {tools.map((tool) => (
            <ToolDetails key={tool.name} tool={tool} serverId={serverId} />
          ))}
        </div>
      )}
    </div>
  );
};

interface ServerCardProps {
  server: MCPServer;
  searchTerm: string;
}

const ServerCard: React.FC<ServerCardProps> = ({ server, searchTerm }) => {
  const [expanded, setExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  const statusColors: Record<MCPServer['status'], string> = {
    starting: 'badge-warning',
    running: 'badge-success',
    stopped: 'badge-muted',
    error: 'badge-danger'
  };

  const statusIcons: Record<MCPServer['status'], string> = {
    starting: '⏳',
    running: '✅',
    stopped: '⏹️',
    error: '❌'
  };

  // Filter tools based on search term
  const filteredTools = useMemo(() => {
    if (!searchTerm.trim()) return server.tools;
    const term = searchTerm.toLowerCase();
    return server.tools.filter(tool => 
      tool.name.toLowerCase().includes(term) ||
      (tool.description && tool.description.toLowerCase().includes(term))
    );
  }, [server.tools, searchTerm]);

  // Group filtered tools by category
  const groupedTools = useMemo(() => categorizeTools(filteredTools), [filteredTools]);

  return (
    <div 
      className="rounded-lg overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🖥️</span>
          <div>
            <div className="font-semibold text-primary">{server.name}</div>
            <div className="text-xs text-muted">
              {filteredTools.length}{searchTerm ? ` of ${server.tools.length}` : ''} tool{filteredTools.length !== 1 ? 's' : ''} {searchTerm ? 'matching' : 'available'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${statusColors[server.status]}`}>
            {statusIcons[server.status]} {server.status}
          </span>
          <span className="text-muted">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-secondary)' }}>
          {server.error && (
            <div className="mx-4 mt-3 p-2 rounded text-danger text-sm" style={{ background: 'rgba(239,71,67,0.1)' }}>
              {server.error}
            </div>
          )}

          {server.startedAt && (
            <div className="px-4 pt-3 text-xs text-muted">
              Started: {new Date(server.startedAt).toLocaleString()}
            </div>
          )}

          <div className="p-4">
            {filteredTools.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-muted uppercase tracking-wide">
                    Available Tools
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setViewMode('grouped')}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        viewMode === 'grouped' 
                          ? 'bg-[var(--accent-primary)] text-white' 
                          : 'text-muted hover:text-primary'
                      }`}
                      title="Grouped view"
                    >
                      📂 Grouped
                    </button>
                    <button
                      onClick={() => setViewMode('flat')}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        viewMode === 'flat' 
                          ? 'bg-[var(--accent-primary)] text-white' 
                          : 'text-muted hover:text-primary'
                      }`}
                      title="Flat list view"
                    >
                      📋 List
                    </button>
                  </div>
                </div>
                
                {viewMode === 'grouped' ? (
                  <div className="space-y-2">
                    {Array.from(groupedTools.entries()).map(([category, tools], idx) => (
                      <ToolGroup 
                        key={category} 
                        category={category} 
                        tools={tools} 
                        serverId={server.id}
                        defaultExpanded={idx === 0 || searchTerm.length > 0}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredTools.map((tool) => (
                      <ToolDetails key={tool.name} tool={tool} serverId={server.id} />
                    ))}
                  </div>
                )}
              </div>
            ) : searchTerm ? (
              <div className="text-sm text-muted italic text-center py-4">
                No tools matching "{searchTerm}"
              </div>
            ) : (
              <div className="text-sm text-muted italic">
                {server.status === 'starting' ? 'Loading tools...' : 'No tools available'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ExecutionItemProps {
  execution: MCPToolExecution;
}

const ExecutionItem: React.FC<ExecutionItemProps> = ({ execution }) => {
  const [showDetails, setShowDetails] = useState(false);

  const statusColors: Record<MCPToolExecution['status'], string> = {
    pending: 'text-muted',
    running: 'text-info',
    completed: 'text-success',
    failed: 'text-danger'
  };

  const statusIcons: Record<MCPToolExecution['status'], string> = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌'
  };

  return (
    <div 
      className="rounded-lg text-xs overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
    >
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className="flex items-center gap-2 truncate">
          <span className={statusColors[execution.status]}>
            {statusIcons[execution.status]}
          </span>
          <span className="font-medium text-primary truncate">{execution.toolName}</span>
        </div>
        <span className="text-muted shrink-0 ml-2">
          {new Date(execution.startedAt).toLocaleTimeString()}
        </span>
      </button>
      
      {showDetails && (
        <div 
          className="px-3 py-2 space-y-2"
          style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-secondary)' }}
        >
          <div>
            <span className="text-muted">Input:</span>
            <pre 
              className="mt-1 p-2 rounded overflow-x-auto text-xs"
              style={{ background: 'var(--bg-primary)' }}
            >
              {JSON.stringify(execution.input, null, 2)}
            </pre>
          </div>
          {execution.output !== undefined && execution.output !== null && (
            <div>
              <span className="text-muted">Output:</span>
              <pre 
                className="mt-1 p-2 rounded overflow-x-auto text-xs max-h-32"
                style={{ background: 'var(--bg-primary)' }}
              >
                {(() => {
                  const outputStr = typeof execution.output === 'string' 
                    ? execution.output 
                    : JSON.stringify(execution.output, null, 2);
                  return outputStr.slice(0, 500) + (outputStr.length > 500 ? '...' : '');
                })()}
              </pre>
            </div>
          )}
          {execution.error && (
            <div className="text-danger">
              <span className="text-muted">Error:</span> {execution.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const MCPPanel: React.FC = () => {
  const { servers, executions, clearExecutions } = useMCPStore();
  const [activeTab, setActiveTab] = useState<'servers' | 'executions'>('servers');
  const [searchTerm, setSearchTerm] = useState('');

  const runningCount = servers.filter(s => s.status === 'running').length;
  const totalTools = servers.reduce((sum, s) => sum + s.tools.length, 0);

  // Count matching tools for search indicator
  const matchingToolsCount = useMemo(() => {
    if (!searchTerm.trim()) return totalTools;
    const term = searchTerm.toLowerCase();
    return servers.reduce((sum, server) => 
      sum + server.tools.filter(tool => 
        tool.name.toLowerCase().includes(term) ||
        (tool.description && tool.description.toLowerCase().includes(term))
      ).length, 0
    );
  }, [servers, searchTerm, totalTools]);

  return (
    <div 
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <h3 className="font-semibold text-primary flex items-center gap-2">
          <span>🔌</span>
          MCP Servers
        </h3>
        <div className="flex gap-3 mt-2 text-xs">
          <span 
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
          >
            <span className="status-dot status-dot-active"></span>
            <span className="font-semibold text-primary">{runningCount}</span>
            <span className="text-muted">running</span>
          </span>
          <span 
            className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-secondary)' }}
          >
            <span>🔧</span>
            <span className="font-semibold text-primary">{matchingToolsCount}{searchTerm ? <span className="text-muted"> / {totalTools}</span> : ''}</span>
            <span className="text-muted">tools</span>
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div 
        className="px-3 py-2"
        style={{ borderBottom: '1px solid var(--border-secondary)', background: 'var(--bg-elevated)' }}
      >
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Search tools by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full py-2 text-sm rounded-md bg-[var(--bg-primary)] text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            style={{ border: '1px solid var(--border-secondary)', paddingLeft: '2rem', paddingRight: '2rem' }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-secondary)' }}>
        <button
          onClick={() => setActiveTab('servers')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'servers'
              ? 'text-accent border-b-2 border-[var(--accent-primary)]'
              : 'text-secondary hover:text-primary'
          }`}
          style={{ background: activeTab === 'servers' ? 'var(--bg-elevated)' : 'transparent' }}
        >
          Servers ({servers.length})
        </button>
        <button
          onClick={() => setActiveTab('executions')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'executions'
              ? 'text-accent border-b-2 border-[var(--accent-primary)]'
              : 'text-secondary hover:text-primary'
          }`}
          style={{ background: activeTab === 'executions' ? 'var(--bg-elevated)' : 'transparent' }}
        >
          History ({executions.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'servers' ? (
          <div className="space-y-3">
            {servers.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <div className="text-3xl mb-2 opacity-50">🔌</div>
                <p>No MCP servers registered</p>
              </div>
            ) : (
              servers.map((server) => (
                <ServerCard key={server.id} server={server} searchTerm={searchTerm} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {executions.length > 0 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={clearExecutions}
                  className="text-xs text-muted hover:text-danger transition-colors"
                >
                  Clear history
                </button>
              </div>
            )}
            {executions.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <div className="text-3xl mb-2 opacity-50">📋</div>
                <p>No tool executions yet</p>
              </div>
            ) : (
              [...executions].reverse().map((execution) => (
                <ExecutionItem key={execution.id} execution={execution} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
