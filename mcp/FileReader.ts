/**
 * MCP File Reader - Provides file reading capabilities for AI agents
 * This module exposes file system operations as MCP tools
 */

export interface FileReadResult {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: {
    path: string;
    size: number;
    lastModified: string;
    encoding: string;
  };
}

export interface DirectoryListResult {
  success: boolean;
  entries?: DirectoryEntry[];
  error?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: string;
}

export interface FileSearchResult {
  success: boolean;
  matches?: FileMatch[];
  error?: string;
}

export interface FileMatch {
  path: string;
  line: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

/**
 * MCP Tool definitions for file operations
 */
export const FILE_READER_TOOLS = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read'
        },
        startLine: {
          type: 'number',
          description: 'Optional start line (1-indexed) for partial read'
        },
        endLine: {
          type: 'number',
          description: 'Optional end line (1-indexed) for partial read'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8'
        }
      },
      required: ['path']
    }
  },

  list_directory: {
    name: 'list_directory',
    description: 'List contents of a directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to list'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively',
          default: false
        },
        pattern: {
          type: 'string',
          description: 'Optional glob pattern to filter results'
        }
      },
      required: ['path']
    }
  },

  search_files: {
    name: 'search_files',
    description: 'Search for text content within files',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to search in'
        },
        query: {
          type: 'string',
          description: 'Search query (text or regex)'
        },
        isRegex: {
          type: 'boolean',
          description: 'Whether query is a regex pattern',
          default: false
        },
        filePattern: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts")'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 50
        }
      },
      required: ['path', 'query']
    }
  },

  file_exists: {
    name: 'file_exists',
    description: 'Check if a file or directory exists',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to check'
        }
      },
      required: ['path']
    }
  },

  get_file_info: {
    name: 'get_file_info',
    description: 'Get metadata about a file without reading its contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file'
        }
      },
      required: ['path']
    }
  }
};

/**
 * FileReader class - Implements file reading operations
 * In browser environment, this uses the File System Access API or simulated data
 */
export class FileReader {
  private workspacePath: string;
  private fileCache: Map<string, { content: string; timestamp: number }> = new Map();
  private cacheTimeout = 5000; // 5 seconds cache

  constructor(workspacePath: string = '') {
    this.workspacePath = workspacePath;
  }

  /**
   * Read file contents
   */
  async readFile(
    path: string,
    options?: { startLine?: number; endLine?: number; encoding?: string }
  ): Promise<FileReadResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      // Check cache first
      const cached = this.fileCache.get(fullPath);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return this.processContent(cached.content, fullPath, options);
      }

      // In browser, use fetch for local files or File System Access API
      const content = await this.fetchFileContent(fullPath);
      
      // Cache the content
      this.fileCache.set(fullPath, { content, timestamp: Date.now() });
      
      return this.processContent(content, fullPath, options);
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(
    path: string,
    options?: { recursive?: boolean; pattern?: string }
  ): Promise<DirectoryListResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      // In browser environment, this would use File System Access API
      // For now, return a simulated response
      const entries = await this.fetchDirectoryContents(fullPath, options);
      
      return {
        success: true,
        entries
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Search files for content
   */
  async searchFiles(
    path: string,
    query: string,
    options?: { isRegex?: boolean; filePattern?: string; maxResults?: number }
  ): Promise<FileSearchResult> {
    try {
      const fullPath = this.resolvePath(path);
      const maxResults = options?.maxResults || 50;
      
      // Get all files in directory
      const dirResult = await this.listDirectory(fullPath, { recursive: true });
      if (!dirResult.success || !dirResult.entries) {
        return { success: false, error: dirResult.error };
      }

      const matches: FileMatch[] = [];
      const regex = options?.isRegex ? new RegExp(query, 'gi') : null;
      const searchQuery = query.toLowerCase();

      for (const entry of dirResult.entries) {
        if (entry.type !== 'file') continue;
        if (matches.length >= maxResults) break;

        // Check file pattern
        if (options?.filePattern && !this.matchGlob(entry.name, options.filePattern)) {
          continue;
        }

        // Read and search file
        const fileResult = await this.readFile(entry.path);
        if (!fileResult.success || !fileResult.content) continue;

        const lines = fileResult.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;

          const line = lines[i];
          const isMatch = regex 
            ? regex.test(line) 
            : line.toLowerCase().includes(searchQuery);

          if (isMatch) {
            matches.push({
              path: entry.path,
              line: i + 1,
              content: line.trim(),
              context: {
                before: lines.slice(Math.max(0, i - 2), i).map(l => l.trim()),
                after: lines.slice(i + 1, i + 3).map(l => l.trim())
              }
            });
          }
        }
      }

      return { success: true, matches };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(path);
      const result = await this.readFile(fullPath);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileInfo(path: string): Promise<FileReadResult> {
    try {
      const fullPath = this.resolvePath(path);
      const content = await this.fetchFileContent(fullPath);
      
      return {
        success: true,
        metadata: {
          path: fullPath,
          size: new Blob([content]).size,
          lastModified: new Date().toISOString(),
          encoding: 'utf-8'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Clear the file cache
   */
  clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * Set workspace path
   */
  setWorkspacePath(path: string): void {
    this.workspacePath = path;
    this.clearCache();
  }

  // Private helper methods

  private resolvePath(path: string): string {
    if (path.startsWith('/') || path.match(/^[A-Za-z]:\\/)) {
      return path;
    }
    return this.workspacePath ? `${this.workspacePath}/${path}` : path;
  }

  private processContent(
    content: string,
    path: string,
    options?: { startLine?: number; endLine?: number }
  ): FileReadResult {
    let processedContent = content;
    
    if (options?.startLine || options?.endLine) {
      const lines = content.split('\n');
      const start = (options.startLine || 1) - 1;
      const end = options.endLine || lines.length;
      processedContent = lines.slice(start, end).join('\n');
    }

    return {
      success: true,
      content: processedContent,
      metadata: {
        path,
        size: new Blob([content]).size,
        lastModified: new Date().toISOString(),
        encoding: 'utf-8'
      }
    };
  }

  private async fetchFileContent(path: string): Promise<string> {
    // In browser environment, try fetch first
    try {
      const response = await fetch(path);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Fetch failed, try File System Access API
    }

    // Try File System Access API if available
    if ('showOpenFilePicker' in window) {
      // This would require user interaction, so we can't use it directly
      // Return empty content with a note
      throw new Error('File not accessible. Use File System Access API with user interaction.');
    }

    throw new Error('Unable to read file in browser environment');
  }

  private async fetchDirectoryContents(
    _path: string,
    _options?: { recursive?: boolean; pattern?: string }
  ): Promise<DirectoryEntry[]> {
    // In browser environment, directory listing is limited
    // This would be implemented with File System Access API in production
    return [];
  }

  private matchGlob(filename: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`, 'i').test(filename);
  }
}

// Export singleton instance
export const fileReader = new FileReader();
