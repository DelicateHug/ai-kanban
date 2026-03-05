/**
 * HostDetails MCP Module
 * Provides tools for getting system and network information
 */

// Base result type with success/error
interface BaseResult {
  success: boolean;
  error?: string;
}

// Result types
export interface HostnameResult extends BaseResult {
  hostname?: string;
}

export interface NetworkAdapter {
  name: string;
  type: string;
  status: string;
  ipv4Address?: string;
  ipv6Address?: string;
  subnetMask?: string;
  defaultGateway?: string;
  macAddress?: string;
  dhcpEnabled?: boolean;
  dnsServers?: string[];
}

export interface IpConfigResult extends BaseResult {
  adapters?: NetworkAdapter[];
  rawOutput?: string;
}

export interface HostDetailsResult extends BaseResult {
  hostname?: string | null;
  platform?: string;
  adapters?: NetworkAdapter[];
}

export interface PingResult extends BaseResult {
  output?: string;
  reachable?: boolean;
  latency?: number | null;
}

export interface DnsResult extends BaseResult {
  output?: string;
  addresses?: string[];
}

// Tool definition type
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

// Tool definitions for MCP - as an object with named properties
export const HOST_DETAILS_TOOLS: {
  get_hostname: ToolDefinition;
  get_ipconfig: ToolDefinition;
  get_host_details: ToolDefinition;
  ping_host: ToolDefinition;
  get_dns_info: ToolDefinition;
} = {
  get_hostname: {
    name: 'get_hostname',
    description: 'Get the hostname of the current machine',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  get_ipconfig: {
    name: 'get_ipconfig',
    description: 'Get network configuration details including IP addresses, adapters, and DNS servers',
    inputSchema: {
      type: 'object',
      properties: {
        adapter: {
          type: 'string',
          description: 'Optional adapter name to filter results'
        },
        includeRaw: {
          type: 'boolean',
          description: 'Include raw command output in the response'
        }
      },
      required: []
    }
  },
  get_host_details: {
    name: 'get_host_details',
    description: 'Get comprehensive host information including hostname and network adapters',
    inputSchema: {
      type: 'object',
      properties: {
        includeDisconnected: {
          type: 'boolean',
          description: 'Include disconnected network adapters'
        }
      },
      required: []
    }
  },
  ping_host: {
    name: 'ping_host',
    description: 'Ping a host to check network connectivity',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'The hostname or IP address to ping'
        },
        count: {
          type: 'number',
          description: 'Number of ping requests to send (default: 4)'
        }
      },
      required: ['host']
    }
  },
  get_dns_info: {
    name: 'get_dns_info',
    description: 'Get DNS resolution information for a hostname',
    inputSchema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'The hostname to look up'
        }
      },
      required: ['hostname']
    }
  }
};

// HostDetails class for executing host-related operations
export class HostDetails {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8765') {
    this.baseUrl = baseUrl;
  }

  async getHostname(): Promise<HostnameResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'get_hostname', input: {} })
      });
      const result = await response.json();
      return {
        success: result.success,
        hostname: result.data?.hostname,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getIpConfig(options?: { adapter?: string; includeRaw?: boolean }): Promise<IpConfigResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tool: 'get_ipconfig', 
          input: { 
            adapter: options?.adapter, 
            include_raw: options?.includeRaw 
          } 
        })
      });
      const result = await response.json();
      return {
        success: result.success,
        adapters: result.data?.adapters,
        rawOutput: result.data?.rawOutput,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getHostDetails(options?: { includeDisconnected?: boolean }): Promise<HostDetailsResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tool: 'get_system_info', 
          input: { include_disconnected: options?.includeDisconnected } 
        })
      });
      const result = await response.json();
      return {
        success: result.success,
        hostname: result.data?.hostname,
        platform: result.data?.platform,
        adapters: result.data?.adapters,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async pingHost(host: string, count?: number): Promise<PingResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tool: 'ping_host', 
          input: { host, count: count || 4 } 
        })
      });
      const result = await response.json();
      return {
        success: result.success,
        output: result.data?.output,
        reachable: result.data?.reachable,
        latency: result.data?.latency,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getDnsInfo(hostname: string): Promise<DnsResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/mcp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tool: 'get_dns_info', 
          input: { hostname } 
        })
      });
      const result = await response.json();
      return {
        success: result.success,
        output: result.data?.output,
        addresses: result.data?.addresses,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Default instance
export const hostDetails = new HostDetails();
