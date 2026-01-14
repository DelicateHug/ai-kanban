/**
 * MCP Manager - Manages MCP server lifecycle and tool registry
 * Tracks running MCP servers and their available tools
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface MCPServer {
  id: string;
  name: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  tools: MCPTool[];
  startedAt?: string;
  error?: string;
}

export interface MCPToolExecution {
  id: string;
  serverId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

interface MCPManagerState {
  servers: MCPServer[];
  executions: MCPToolExecution[];
  
  // Actions
  registerServer: (server: Omit<MCPServer, 'status' | 'tools'>) => void;
  updateServerStatus: (serverId: string, status: MCPServer['status'], error?: string) => void;
  setServerTools: (serverId: string, tools: MCPTool[]) => void;
  removeServer: (serverId: string) => void;
  
  addExecution: (execution: MCPToolExecution) => void;
  updateExecution: (executionId: string, updates: Partial<MCPToolExecution>) => void;
  clearExecutions: () => void;
  
  getServerById: (serverId: string) => MCPServer | undefined;
  getRunningServers: () => MCPServer[];
  getAllTools: () => { server: MCPServer; tool: MCPTool }[];
}

export const useMCPStore = create<MCPManagerState>((set, get) => ({
  servers: [],
  executions: [],

  registerServer: (server) => {
    set((state) => ({
      servers: [
        ...state.servers.filter(s => s.id !== server.id),
        {
          ...server,
          status: 'starting',
          tools: [],
          startedAt: new Date().toISOString()
        }
      ]
    }));
  },

  updateServerStatus: (serverId, status, error) => {
    set((state) => ({
      servers: state.servers.map(s =>
        s.id === serverId
          ? { ...s, status, error: error || s.error }
          : s
      )
    }));
  },

  setServerTools: (serverId, tools) => {
    set((state) => ({
      servers: state.servers.map(s =>
        s.id === serverId
          ? { ...s, tools }
          : s
      )
    }));
  },

  removeServer: (serverId) => {
    set((state) => ({
      servers: state.servers.filter(s => s.id !== serverId)
    }));
  },

  addExecution: (execution) => {
    set((state) => ({
      executions: [...state.executions.slice(-99), execution] // Keep last 100
    }));
  },

  updateExecution: (executionId, updates) => {
    set((state) => ({
      executions: state.executions.map(e =>
        e.id === executionId
          ? { ...e, ...updates }
          : e
      )
    }));
  },

  clearExecutions: () => {
    set({ executions: [] });
  },

  getServerById: (serverId) => {
    return get().servers.find(s => s.id === serverId);
  },

  getRunningServers: () => {
    return get().servers.filter(s => s.status === 'running');
  },

  getAllTools: () => {
    const result: { server: MCPServer; tool: MCPTool }[] = [];
    for (const server of get().servers) {
      if (server.status === 'running') {
        for (const tool of server.tools) {
          result.push({ server, tool });
        }
      }
    }
    return result;
  }
}));

/**
 * MCP Manager class - handles MCP server lifecycle
 */
class MCPManagerClass {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register the built-in FileReader MCP server
    await this.startBuiltInServer();
    
    this.initialized = true;
    console.log('[MCPManager] Initialized');
  }

  private async startBuiltInServer(): Promise<void> {
    const { mcpClient } = await import('../../mcp');
    
    // Register the built-in file reader server
    useMCPStore.getState().registerServer({
      id: 'file-reader',
      name: 'File Reader'
    });

    try {
      // Get tools from the MCP client
      const tools = mcpClient.getTools();
      
      useMCPStore.getState().setServerTools('file-reader', tools);
      useMCPStore.getState().updateServerStatus('file-reader', 'running');
      
      console.log(`[MCPManager] File Reader server started with ${tools.length} tools`);
    } catch (error) {
      useMCPStore.getState().updateServerStatus(
        'file-reader',
        'error',
        error instanceof Error ? error.message : 'Failed to start'
      );
    }
  }

  /**
   * Execute a tool on a specific server
   */
  async executeTool(serverId: string, toolName: string, input: unknown): Promise<unknown> {
    const executionId = uuidv4();
    
    useMCPStore.getState().addExecution({
      id: executionId,
      serverId,
      toolName,
      input,
      status: 'running',
      startedAt: new Date().toISOString()
    });

    try {
      let result: unknown;

      if (serverId === 'file-reader') {
        const { mcpClient } = await import('../../mcp');
        const toolResult = await mcpClient.executeTool(toolName, input);
        
        if (!toolResult.success) {
          throw new Error(toolResult.error || 'Tool execution failed');
        }
        result = toolResult.data;
      } else {
        throw new Error(`Unknown server: ${serverId}`);
      }

      useMCPStore.getState().updateExecution(executionId, {
        status: 'completed',
        output: result,
        completedAt: new Date().toISOString()
      });

      return result;
    } catch (error) {
      useMCPStore.getState().updateExecution(executionId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Get all available tools across all running servers
   */
  getAllTools(): { serverId: string; serverName: string; tool: MCPTool }[] {
    return useMCPStore.getState().getAllTools().map(({ server, tool }) => ({
      serverId: server.id,
      serverName: server.name,
      tool
    }));
  }

  shutdown(): void {
    // Stop all servers
    const servers = useMCPStore.getState().servers;
    for (const server of servers) {
      useMCPStore.getState().updateServerStatus(server.id, 'stopped');
    }
    this.initialized = false;
    console.log('[MCPManager] Shutdown');
  }
}

export const mcpManager = new MCPManagerClass();
