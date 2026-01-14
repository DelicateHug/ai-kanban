/**
 * MCP (Model Context Protocol) Module
 * Provides tools and capabilities for AI agents to interact with the system
 */

import { fileReader, FILE_READER_TOOLS } from './FileReader';
import { fileWriter, FILE_WRITER_TOOLS } from './FileWriter';
import { hostDetails, HOST_DETAILS_TOOLS } from './HostDetails';

export { FileReader, fileReader, FILE_READER_TOOLS } from './FileReader';
export { FileWriter, fileWriter, FILE_WRITER_TOOLS } from './FileWriter';
export { HostDetails, hostDetails, HOST_DETAILS_TOOLS } from './HostDetails';
export type { 
  FileReadResult, 
  DirectoryListResult, 
  DirectoryEntry, 
  FileSearchResult, 
  FileMatch 
} from './FileReader';
export type {
  FileWriteResult,
  FileAppendResult,
  FileDeleteResult,
  FileCopyResult,
  FileMoveResult,
  DirectoryCreateResult
} from './FileWriter';
export type {
  HostnameResult,
  IpConfigResult,
  NetworkAdapter,
  HostDetailsResult,
  PingResult,
  DnsResult
} from './HostDetails';

// MCP Tool registry
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * MCP Client - Central interface for MCP tools
 */
export class MCPClient {
  private tools: Map<string, MCPTool> = new Map();
  private handlers: Map<string, (input: unknown) => Promise<MCPToolResult>> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register a tool with the MCP client
   */
  registerTool(
    tool: MCPTool,
    handler: (input: unknown) => Promise<MCPToolResult>
  ): void {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
  }

  /**
   * Get all registered tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, input: unknown): Promise<MCPToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return {
        success: false,
        error: `Tool not found: ${name}`
      };
    }

    try {
      return await handler(input);
    } catch (error) {
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Register default file reading tools
   */
  private registerDefaultTools(): void {
    // Register read_file tool
    this.registerTool(
      FILE_READER_TOOLS.read_file,
      async (input: unknown) => {
        const { path, startLine, endLine, encoding } = input as {
          path: string;
          startLine?: number;
          endLine?: number;
          encoding?: string;
        };
        const result = await fileReader.readFile(path, { startLine, endLine, encoding });
        return {
          success: result.success,
          data: result.content,
          error: result.error
        };
      }
    );

    // Register list_directory tool
    this.registerTool(
      FILE_READER_TOOLS.list_directory,
      async (input: unknown) => {
        const { path, recursive, pattern } = input as {
          path: string;
          recursive?: boolean;
          pattern?: string;
        };
        const result = await fileReader.listDirectory(path, { recursive, pattern });
        return {
          success: result.success,
          data: result.entries,
          error: result.error
        };
      }
    );

    // Register search_files tool
    this.registerTool(
      FILE_READER_TOOLS.search_files,
      async (input: unknown) => {
        const { path, query, isRegex, filePattern, maxResults } = input as {
          path: string;
          query: string;
          isRegex?: boolean;
          filePattern?: string;
          maxResults?: number;
        };
        const result = await fileReader.searchFiles(path, query, {
          isRegex,
          filePattern,
          maxResults
        });
        return {
          success: result.success,
          data: result.matches,
          error: result.error
        };
      }
    );

    // Register file_exists tool
    this.registerTool(
      FILE_READER_TOOLS.file_exists,
      async (input: unknown) => {
        const { path } = input as { path: string };
        const exists = await fileReader.fileExists(path);
        return {
          success: true,
          data: exists
        };
      }
    );

    // Register get_file_info tool
    this.registerTool(
      FILE_READER_TOOLS.get_file_info,
      async (input: unknown) => {
        const { path } = input as { path: string };
        const result = await fileReader.getFileInfo(path);
        return {
          success: result.success,
          data: result.metadata,
          error: result.error
        };
      }
    );

    // Register file writer tools
    this.registerTool(
      FILE_WRITER_TOOLS.write_file,
      async (input: unknown) => {
        const { path, content, encoding, createDirectories } = input as {
          path: string;
          content: string;
          encoding?: string;
          createDirectories?: boolean;
        };
        const result = await fileWriter.writeFile(path, content, { encoding, createDirectories });
        return {
          success: result.success,
          data: { path: result.path, bytesWritten: result.bytesWritten },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.append_file,
      async (input: unknown) => {
        const { path, content, encoding } = input as {
          path: string;
          content: string;
          encoding?: string;
        };
        const result = await fileWriter.appendFile(path, content, { encoding });
        return {
          success: result.success,
          data: { path: result.path, bytesAppended: result.bytesAppended },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.delete_file,
      async (input: unknown) => {
        const { path } = input as { path: string };
        const result = await fileWriter.deleteFile(path);
        return {
          success: result.success,
          data: { path: result.path },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.copy_file,
      async (input: unknown) => {
        const { sourcePath, destinationPath, overwrite } = input as {
          sourcePath: string;
          destinationPath: string;
          overwrite?: boolean;
        };
        const result = await fileWriter.copyFile(sourcePath, destinationPath, { overwrite });
        return {
          success: result.success,
          data: { sourcePath: result.sourcePath, destinationPath: result.destinationPath },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.move_file,
      async (input: unknown) => {
        const { sourcePath, destinationPath, overwrite } = input as {
          sourcePath: string;
          destinationPath: string;
          overwrite?: boolean;
        };
        const result = await fileWriter.moveFile(sourcePath, destinationPath, { overwrite });
        return {
          success: result.success,
          data: { sourcePath: result.sourcePath, destinationPath: result.destinationPath },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.create_directory,
      async (input: unknown) => {
        const { path, recursive } = input as {
          path: string;
          recursive?: boolean;
        };
        const result = await fileWriter.createDirectory(path, { recursive });
        return {
          success: result.success,
          data: { path: result.path },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.replace_in_file,
      async (input: unknown) => {
        const { path, searchPattern, replacement, isRegex, replaceAll } = input as {
          path: string;
          searchPattern: string;
          replacement: string;
          isRegex?: boolean;
          replaceAll?: boolean;
        };
        const result = await fileWriter.replaceInFile(path, searchPattern, replacement, { isRegex, replaceAll });
        return {
          success: result.success,
          data: { path: result.path },
          error: result.error
        };
      }
    );

    this.registerTool(
      FILE_WRITER_TOOLS.insert_at_line,
      async (input: unknown) => {
        const { path, lineNumber, content } = input as {
          path: string;
          lineNumber: number;
          content: string;
        };
        const result = await fileWriter.insertAtLine(path, lineNumber, content);
        return {
          success: result.success,
          data: { path: result.path },
          error: result.error
        };
      }
    );

    // Register host details tools
    this.registerTool(
      HOST_DETAILS_TOOLS.get_hostname,
      async () => {
        const result = await hostDetails.getHostname();
        return {
          success: result.success,
          data: result.hostname,
          error: result.error
        };
      }
    );

    this.registerTool(
      HOST_DETAILS_TOOLS.get_ipconfig,
      async (input: unknown) => {
        const { adapter, includeRaw } = input as {
          adapter?: string;
          includeRaw?: boolean;
        };
        const result = await hostDetails.getIpConfig({ adapter, includeRaw });
        return {
          success: result.success,
          data: { adapters: result.adapters, rawOutput: result.rawOutput },
          error: result.error
        };
      }
    );

    this.registerTool(
      HOST_DETAILS_TOOLS.get_host_details,
      async (input: unknown) => {
        const { includeDisconnected } = input as {
          includeDisconnected?: boolean;
        };
        const result = await hostDetails.getHostDetails({ includeDisconnected });
        return {
          success: result.success,
          data: { hostname: result.hostname, adapters: result.adapters },
          error: result.error
        };
      }
    );

    this.registerTool(
      HOST_DETAILS_TOOLS.ping_host,
      async (input: unknown) => {
        const { host, count } = input as {
          host: string;
          count?: number;
        };
        const result = await hostDetails.pingHost(host, count);
        return {
          success: result.success,
          data: { output: result.output, reachable: result.reachable },
          error: result.error
        };
      }
    );

    this.registerTool(
      HOST_DETAILS_TOOLS.get_dns_info,
      async (input: unknown) => {
        const { hostname } = input as { hostname: string };
        const result = await hostDetails.getDnsInfo(hostname);
        return {
          success: result.success,
          data: result.output,
          error: result.error
        };
      }
    );
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();
