import { useEffect, useState } from 'react';
import { KanbanBoard, FileLockPanel, SystemMonitor, MCPPanel, ProjectOverview, CreateProjectModal } from './components';
import { taskController } from './core/TaskController';
import { mcpManager } from './core/MCPManager';
import { loadTasksFromFile, loadTasksFromStorage, saveTasksToStorage } from './core/TaskStore';
import { loadProjectsFromFile, loadProjectsFromStorage, saveProjectsToStorage, useProjectStore } from './core/ProjectStore';
import { getFullConfig } from './core/config';
import { preloadAllFiles } from './components/FileSelector';

type AppView = 'overview' | 'board';

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentView, setCurrentView] = useState<AppView>('overview');
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  useEffect(() => {
    const init = async () => {
      try {
        // Load saved tasks first
        const config = getFullConfig();
        const filePath = config.autoSave?.filePath || 'data/tasks.json';
        
        // Try to load from file first, then localStorage as fallback
        const loaded = await loadTasksFromFile(filePath);
        if (!loaded) {
          loadTasksFromStorage();
        }
        console.log('Tasks loaded from storage');
        
        // Load projects
        const projectsLoaded = await loadProjectsFromFile('data/projects.json');
        if (!projectsLoaded) {
          loadProjectsFromStorage();
        }
        console.log('Projects loaded');
        
        // Pre-load instruction files for planning/review
        await preloadAllFiles();
        
        // Initialize MCP servers first
        await mcpManager.initialize();
        
        // Then initialize task controller
        await taskController.initialize();
        taskController.start();
        setIsInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize');
      }
    };

    init();

    return () => {
      // Save tasks and projects before shutdown
      saveTasksToStorage(); // Synchronous save to localStorage
      saveProjectsToStorage();
      
      taskController.shutdown();
      mcpManager.shutdown();
    };
  }, []);

  const handleSelectProject = (projectId: string | null) => {
    setActiveProject(projectId);
    setCurrentView('board');
  };

  const handleBackToOverview = () => {
    setCurrentView('overview');
  };

  const handleProjectCreated = (projectId: string) => {
    setActiveProject(projectId);
    setCurrentView('board');
  };

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div 
          className="p-8 rounded-xl max-w-md animate-fade-in"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: 'rgba(239,71,67,0.15)' }}
            >
              ❌
            </div>
            <h1 className="text-xl font-bold text-danger">Initialization Error</h1>
          </div>
          <p className="text-secondary mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary w-full"
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center animate-fade-in">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div 
              className="absolute inset-0 rounded-full animate-spin"
              style={{ 
                border: '3px solid var(--border-secondary)',
                borderTopColor: 'var(--accent-primary)'
              }}
            />
            <div 
              className="absolute inset-2 rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'var(--bg-card)' }}
            >
              🤖
            </div>
          </div>
          <p className="text-secondary">Initializing workers...</p>
        </div>
      </div>
    );
  }

  // Project Overview View
  if (currentView === 'overview') {
    return (
      <>
        <ProjectOverview 
          onSelectProject={handleSelectProject}
          onCreateProject={() => setShowCreateProjectModal(true)}
        />
        {showCreateProjectModal && (
          <CreateProjectModal 
            onClose={() => setShowCreateProjectModal(false)}
            onCreated={handleProjectCreated}
          />
        )}
      </>
    );
  }

  // Kanban Board View
  return (
    <div className="h-screen flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Main Board */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <KanbanBoard 
          currentProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onBackToOverview={handleBackToOverview}
        />
      </div>

      {/* Sidebar Toggle */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 p-3 rounded-l-lg transition-all"
        style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-secondary)',
          borderRight: 'none'
        }}
      >
        <span className="text-secondary">
          {showSidebar ? '→' : '←'}
        </span>
      </button>

      {/* Sidebar */}
      {showSidebar && (
        <div 
          className="w-80 p-4 space-y-4 overflow-y-auto animate-fade-in"
          style={{ 
            background: 'var(--bg-secondary)', 
            borderLeft: '1px solid var(--border-secondary)' 
          }}
        >
          <SystemMonitor />
          <MCPPanel />
          <FileLockPanel />
        </div>
      )}

      {/* Create Project Modal (can be opened from board too) */}
      {showCreateProjectModal && (
        <CreateProjectModal 
          onClose={() => setShowCreateProjectModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}

export default App;
