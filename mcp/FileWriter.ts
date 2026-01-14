/**
 * MCP File Writer - Provides file writing capabilities for AI agents
 * This module exposes file system write operations as MCP tools
 */

export interface FileWriteResult {
  success: boolean;
  path?: string;
  error?: string;
  bytesWritten?: number;
}

export interface FileAppendResult {
  success: boolean;
  path?: string;
  error?: string;
  bytesAppended?: number;
}

export interface FileDeleteResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface FileCopyResult {
  success: boolean;
  sourcePath?: string;
  destinationPath?: string;
  error?: string;
}

export interface FileMoveResult {
  success: boolean;
  sourcePath?: string;
  destinationPath?: string;
  error?: string;
}

export interface DirectoryCreateResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * MCP Tool definitions for file write operations
 */
export const FILE_WRITER_TOOLS = {
  write_file: {
    name: 'write_file',
    description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to write'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8'
        },
        createDirectories: {
          type: 'boolean',
          description: 'Create parent directories if they do not exist',
          default: true
        }
      },
      required: ['path', 'content']
    }
  },

  append_file: {
    name: 'append_file',
    description: 'Append content to the end of a file. Creates the file if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file'
        },
        content: {
          type: 'string',
          description: 'Content to append to the file'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8'
        }
      },
      required: ['path', 'content']
    }
  },

  delete_file: {
    name: 'delete_file',
    description: 'Delete a file at the specified path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to delete'
        }
      },
      required: ['path']
    }
  },

  copy_file: {
    name: 'copy_file',
    description: 'Copy a file from source to destination',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: {
          type: 'string',
          description: 'Path to the source file'
        },
        destinationPath: {
          type: 'string',
          description: 'Path to the destination file'
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it exists',
          default: false
        }
      },
      required: ['sourcePath', 'destinationPath']
    }
  },

  move_file: {
    name: 'move_file',
    description: 'Move/rename a file from source to destination',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: {
          type: 'string',
          description: 'Path to the source file'
        },
        destinationPath: {
          type: 'string',
          description: 'Path to the destination file'
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite destination if it exists',
          default: false
        }
      },
      required: ['sourcePath', 'destinationPath']
    }
  },

  create_directory: {
    name: 'create_directory',
    description: 'Create a directory at the specified path',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to create'
        },
        recursive: {
          type: 'boolean',
          description: 'Create parent directories if they do not exist',
          default: true
        }
      },
      required: ['path']
    }
  },

  replace_in_file: {
    name: 'replace_in_file',
    description: 'Replace text in a file. Can use string or regex pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file'
        },
        searchPattern: {
          type: 'string',
          description: 'Text or regex pattern to search for'
        },
        replacement: {
          type: 'string',
          description: 'Text to replace matches with'
        },
        isRegex: {
          type: 'boolean',
          description: 'Whether searchPattern is a regex',
          default: false
        },
        replaceAll: {
          type: 'boolean',
          description: 'Replace all occurrences or just the first',
          default: true
        }
      },
      required: ['path', 'searchPattern', 'replacement']
    }
  },

  insert_at_line: {
    name: 'insert_at_line',
    description: 'Insert content at a specific line number in a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file'
        },
        lineNumber: {
          type: 'number',
          description: 'Line number to insert at (1-indexed)'
        },
        content: {
          type: 'string',
          description: 'Content to insert'
        }
      },
      required: ['path', 'lineNumber', 'content']
    }
  }
};

/**
 * FileWriter class - Implements file writing operations
 * Uses backend API for actual file operations
 */
export class FileWriter {
  private workspacePath: string;
  private backendUrl: string;

  constructor(workspacePath: string = '', backendUrl: string = 'http://localhost:8765') {
    this.workspacePath = workspacePath;
    this.backendUrl = backendUrl;
  }

  /**
   * Write content to a file
   */
  async writeFile(
    path: string,
    content: string,
    options?: { encoding?: string; createDirectories?: boolean }
  ): Promise<FileWriteResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      const response = await fetch(`${this.backendUrl}/api/file/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          content,
          encoding: options?.encoding || 'utf-8',
          createDirectories: options?.createDirectories ?? true
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          path: fullPath,
          bytesWritten: new Blob([content]).size
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to write file'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Append content to a file
   */
  async appendFile(
    path: string,
    content: string,
    options?: { encoding?: string }
  ): Promise<FileAppendResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      const response = await fetch(`${this.backendUrl}/api/file/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          content,
          encoding: options?.encoding || 'utf-8'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          path: fullPath,
          bytesAppended: new Blob([content]).size
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to append to file'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to append file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(path: string): Promise<FileDeleteResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      const response = await fetch(`${this.backendUrl}/api/file/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          path: fullPath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to delete file'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Copy a file
   */
  async copyFile(
    sourcePath: string,
    destinationPath: string,
    options?: { overwrite?: boolean }
  ): Promise<FileCopyResult> {
    try {
      const fullSourcePath = this.resolvePath(sourcePath);
      const fullDestPath = this.resolvePath(destinationPath);
      
      const response = await fetch(`${this.backendUrl}/api/file/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: fullSourcePath,
          destinationPath: fullDestPath,
          overwrite: options?.overwrite ?? false
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          sourcePath: fullSourcePath,
          destinationPath: fullDestPath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to copy file'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Move/rename a file
   */
  async moveFile(
    sourcePath: string,
    destinationPath: string,
    options?: { overwrite?: boolean }
  ): Promise<FileMoveResult> {
    try {
      const fullSourcePath = this.resolvePath(sourcePath);
      const fullDestPath = this.resolvePath(destinationPath);
      
      const response = await fetch(`${this.backendUrl}/api/file/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: fullSourcePath,
          destinationPath: fullDestPath,
          overwrite: options?.overwrite ?? false
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          sourcePath: fullSourcePath,
          destinationPath: fullDestPath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to move file'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a directory
   */
  async createDirectory(
    path: string,
    options?: { recursive?: boolean }
  ): Promise<DirectoryCreateResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      const response = await fetch(`${this.backendUrl}/api/directory/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          recursive: options?.recursive ?? true
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          path: fullPath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to create directory'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Replace text in a file
   */
  async replaceInFile(
    path: string,
    searchPattern: string,
    replacement: string,
    options?: { isRegex?: boolean; replaceAll?: boolean }
  ): Promise<FileWriteResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      const response = await fetch(`${this.backendUrl}/api/file/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          searchPattern,
          replacement,
          isRegex: options?.isRegex ?? false,
          replaceAll: options?.replaceAll ?? true
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          path: fullPath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to replace in file'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to replace in file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Insert content at a specific line
   */
  async insertAtLine(
    path: string,
    lineNumber: number,
    content: string
  ): Promise<FileWriteResult> {
    try {
      const fullPath = this.resolvePath(path);
      
      const response = await fetch(`${this.backendUrl}/api/file/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fullPath,
          lineNumber,
          content
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          path: fullPath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to insert at line'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to insert at line: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Set workspace path
   */
  setWorkspacePath(path: string): void {
    this.workspacePath = path;
  }

  /**
   * Set backend URL
   */
  setBackendUrl(url: string): void {
    this.backendUrl = url;
  }

  // Private helper methods

  private resolvePath(path: string): string {
    if (path.startsWith('/') || path.match(/^[A-Za-z]:\\/)) {
      return path;
    }
    return this.workspacePath ? `${this.workspacePath}/${path}` : path;
  }
}

// Export singleton instance
export const fileWriter = new FileWriter();
