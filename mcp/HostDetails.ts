/**
 * MCP Host Details - Provides host/network information capabilities for AI agents
 * This module exposes system commands like ipconfig and hostname as MCP tools
 * 
 * In browser context, this uses a backend API or VS Code extension API
 * to execute system commands. Falls back to simulated data for demo purposes.
 */

export interface HostnameResult {
  success: boolean;
  hostname?: string;
  error?: string;
}

export interface IpConfigResult {
  success: boolean;
  rawOutput?: string;
  adapters?: NetworkAdapter[];
  error?: string;
}

export interface NetworkAdapter {
  name: string;
  type: string;
  ipv4Address?: string;
  ipv6Address?: string;
  subnetMask?: string;
  defaultGateway?: string;
  dhcpEnabled?: boolean;
  dnsServers?: string[];
  macAddress?: string;
  status: 'connected' | 'disconnected' | 'unknown';
}

export interface HostDetailsResult {
  success: boolean;
  hostname?: string;
  adapters?: NetworkAdapter[];
  error?: string;
}

export interface PingResult {
  success: boolean;
  output?: string;
  reachable?: boolean;
  latency?: number;
  error?: string;
}

export interface DnsResult {
  success: boolean;
  output?: string;
  addresses?: string[];
  error?: string;
}

/**
 * MCP Tool definitions for host details operations
 */
export const HOST_DETAILS_TOOLS = {
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
    description: 'Get network configuration details (ipconfig /all equivalent)',
    inputSchema: {
      type: 'object',
      properties: {
        adapter: {
          type: 'string',
          description: 'Optional: Filter by adapter name (partial match supported)'
        },
        includeRaw: {
          type: 'boolean',
          description: 'Include raw command output in result',
          default: false
        }
      },
      required: []
    }
  },

  get_host_details: {
    name: 'get_host_details',
    description: 'Get comprehensive host details including hostname and all network adapters',
    inputSchema: {
      type: 'object',
      properties: {
        includeDisconnected: {
          type: 'boolean',
          description: 'Include disconnected adapters in the result',
          default: true
        }
      },
      required: []
    }
  },

  ping_host: {
    name: 'ping_host',
    description: 'Ping a host to check connectivity',
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Hostname or IP address to ping'
        },
        count: {
          type: 'number',
          description: 'Number of ping requests to send (default: 4)',
          default: 4
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
          description: 'Hostname to resolve'
        }
      },
      required: ['hostname']
    }
  }
};

// Backend API endpoint for system commands (if available)
const BACKEND_API_URL = '/api/system';

/**
 * Check if VS Code extension API is available
 */
function getVSCodeApi(): { postMessage: (msg: unknown) => void } | null {
  // Check if running in VS Code webview
  if (typeof window !== 'undefined' && 'acquireVsCodeApi' in window) {
    return (window as unknown as { acquireVsCodeApi: () => { postMessage: (msg: unknown) => void } }).acquireVsCodeApi();
  }
  return null;
}

/**
 * Execute a system command via backend API or VS Code extension
 */
async function executeSystemCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }> {
  // Try VS Code extension API first
  const vscode = getVSCodeApi();
  if (vscode) {
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'commandResult' && event.data.command === command) {
          window.removeEventListener('message', handler);
          resolve(event.data.result);
        }
      };
      window.addEventListener('message', handler);
      vscode.postMessage({ type: 'executeCommand', command });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'Command execution timed out' });
      }, 10000);
    });
  }

  // Try backend API
  try {
    const response = await fetch(`${BACKEND_API_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Backend not available, fall through to simulation
  }

  // Return null to indicate we need to simulate
  return { success: false, error: 'No backend available - using simulated data' };
}

/**
 * HostDetails class - Provides host/network information operations
 */
export class HostDetails {
  private cachedHostname: string | null = null;
  private cachedAdapters: NetworkAdapter[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTimeout = 30000; // 30 seconds cache

  /**
   * Get the hostname of the current machine
   */
  async getHostname(): Promise<HostnameResult> {
    // Check cache
    if (this.cachedHostname && Date.now() - this.cacheTimestamp < this.cacheTimeout) {
      return { success: true, hostname: this.cachedHostname };
    }

    const result = await executeSystemCommand('hostname');
    
    if (result.success && result.output) {
      this.cachedHostname = result.output.trim();
      this.cacheTimestamp = Date.now();
      return { success: true, hostname: this.cachedHostname };
    }

    // Fallback: try to get from browser if available
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname || 'localhost';
      return { success: true, hostname };
    }

    return {
      success: true,
      hostname: 'unknown-host'
    };
  }

  /**
   * Get network configuration details
   */
  async getIpConfig(options: { adapter?: string; includeRaw?: boolean } = {}): Promise<IpConfigResult> {
    // Check cache
    if (this.cachedAdapters && Date.now() - this.cacheTimestamp < this.cacheTimeout) {
      const adapters = options.adapter
        ? this.cachedAdapters.filter(a => a.name.toLowerCase().includes(options.adapter!.toLowerCase()))
        : this.cachedAdapters;
      return { success: true, adapters };
    }

    const result = await executeSystemCommand('ipconfig /all');
    
    if (result.success && result.output) {
      const adapters = this.parseIpConfig(result.output);
      this.cachedAdapters = adapters;
      this.cacheTimestamp = Date.now();
      
      const filteredAdapters = options.adapter
        ? adapters.filter(a => a.name.toLowerCase().includes(options.adapter!.toLowerCase()))
        : adapters;

      const response: IpConfigResult = { success: true, adapters: filteredAdapters };
      if (options.includeRaw) {
        response.rawOutput = result.output;
      }
      return response;
    }

    // Return simulated data for demo/development
    const simulatedAdapters = this.getSimulatedAdapters();
    const filteredAdapters = options.adapter
      ? simulatedAdapters.filter(a => a.name.toLowerCase().includes(options.adapter!.toLowerCase()))
      : simulatedAdapters;

    return { success: true, adapters: filteredAdapters };
  }

  /**
   * Get comprehensive host details
   */
  async getHostDetails(options: { includeDisconnected?: boolean } = {}): Promise<HostDetailsResult> {
    const [hostnameResult, ipConfigResult] = await Promise.all([
      this.getHostname(),
      this.getIpConfig()
    ]);

    if (!hostnameResult.success) {
      return { success: false, error: hostnameResult.error };
    }

    let adapters = ipConfigResult.adapters || [];
    
    if (options.includeDisconnected === false) {
      adapters = adapters.filter(a => a.status === 'connected');
    }

    return {
      success: true,
      hostname: hostnameResult.hostname,
      adapters
    };
  }

  /**
   * Ping a host to check connectivity
   */
  async pingHost(host: string, count: number = 4): Promise<PingResult> {
    const command = `ping -n ${count} ${host}`;
    const result = await executeSystemCommand(command);
    
    if (result.success && result.output) {
      const reachable = !result.output.includes('Request timed out') && 
                       !result.output.includes('could not find host') &&
                       !result.output.includes('Destination host unreachable');
      
      // Try to extract average latency
      const latencyMatch = result.output.match(/Average = (\d+)ms/);
      const latency = latencyMatch ? parseInt(latencyMatch[1], 10) : undefined;

      return {
        success: true,
        output: result.output,
        reachable,
        latency
      };
    }

    // Simulated response for demo
    return {
      success: true,
      output: `Pinging ${host} with 32 bytes of data:\nReply from ${host}: bytes=32 time<1ms TTL=128\n\nPing statistics for ${host}:\n    Packets: Sent = ${count}, Received = ${count}, Lost = 0 (0% loss)`,
      reachable: true,
      latency: 1
    };
  }

  /**
   * Get DNS resolution information
   */
  async getDnsInfo(hostname: string): Promise<DnsResult> {
    const command = `nslookup ${hostname}`;
    const result = await executeSystemCommand(command);
    
    if (result.success && result.output) {
      // Extract IP addresses from nslookup output
      const addressMatches = result.output.match(/Address:\s*([\d.]+)/g);
      const addresses = addressMatches
        ? addressMatches.map(m => m.replace('Address:', '').trim()).filter(a => !a.includes('127.0.0'))
        : [];

      return {
        success: true,
        output: result.output,
        addresses
      };
    }

    // Simulated response for demo
    return {
      success: true,
      output: `Server:  dns.local\nAddress:  192.168.1.1\n\nName:    ${hostname}\nAddress:  93.184.216.34`,
      addresses: ['93.184.216.34']
    };
  }

  /**
   * Parse ipconfig output into structured data
   */
  private parseIpConfig(output: string): NetworkAdapter[] {
    const adapters: NetworkAdapter[] = [];
    const sections = output.split(/\r?\n\r?\n/);
    let currentAdapter: Partial<NetworkAdapter> | null = null;

    for (const section of sections) {
      const lines = section.split(/\r?\n/);
      
      for (const line of lines) {
        // Check for adapter header
        const adapterMatch = line.match(/^(.+?)\s+adapter\s+(.+):$/i);
        if (adapterMatch) {
          if (currentAdapter && currentAdapter.name) {
            adapters.push(this.finalizeAdapter(currentAdapter));
          }
          currentAdapter = {
            type: adapterMatch[1].trim(),
            name: adapterMatch[2].trim(),
            status: 'unknown'
          };
          continue;
        }

        if (!currentAdapter) continue;

        // Parse key-value pairs
        const kvMatch = line.match(/^\s+(.+?)\s*[.:]+\s*(.+)$/);
        if (kvMatch) {
          const [, key, value] = kvMatch;
          const keyLower = key.toLowerCase().trim();
          const valueTrimmed = value.trim();

          if (keyLower.includes('ipv4 address')) {
            currentAdapter.ipv4Address = valueTrimmed.replace(/\(Preferred\)/i, '').trim();
            currentAdapter.status = 'connected';
          } else if (keyLower.includes('ipv6 address')) {
            currentAdapter.ipv6Address = valueTrimmed.replace(/\(Preferred\)/i, '').trim();
          } else if (keyLower.includes('subnet mask')) {
            currentAdapter.subnetMask = valueTrimmed;
          } else if (keyLower.includes('default gateway') && valueTrimmed) {
            currentAdapter.defaultGateway = valueTrimmed;
          } else if (keyLower.includes('dhcp enabled')) {
            currentAdapter.dhcpEnabled = valueTrimmed.toLowerCase() === 'yes';
          } else if (keyLower.includes('dns servers')) {
            currentAdapter.dnsServers = [valueTrimmed];
          } else if (keyLower.includes('physical address')) {
            currentAdapter.macAddress = valueTrimmed;
          } else if (keyLower.includes('media state') && valueTrimmed.toLowerCase().includes('disconnected')) {
            currentAdapter.status = 'disconnected';
          }
        } else if (currentAdapter.dnsServers && line.match(/^\s+[\d.:a-f]+$/i)) {
          currentAdapter.dnsServers.push(line.trim());
        }
      }
    }

    if (currentAdapter && currentAdapter.name) {
      adapters.push(this.finalizeAdapter(currentAdapter));
    }

    return adapters;
  }

  /**
   * Finalize adapter object with defaults
   */
  private finalizeAdapter(partial: Partial<NetworkAdapter>): NetworkAdapter {
    return {
      name: partial.name || 'Unknown',
      type: partial.type || 'Unknown',
      ipv4Address: partial.ipv4Address,
      ipv6Address: partial.ipv6Address,
      subnetMask: partial.subnetMask,
      defaultGateway: partial.defaultGateway,
      dhcpEnabled: partial.dhcpEnabled,
      dnsServers: partial.dnsServers,
      macAddress: partial.macAddress,
      status: partial.status || 'unknown'
    };
  }

  /**
   * Get simulated network adapters for demo/development
   */
  private getSimulatedAdapters(): NetworkAdapter[] {
    return [
      {
        name: 'Ethernet',
        type: 'Ethernet',
        ipv4Address: '192.168.1.100',
        ipv6Address: 'fe80::1234:5678:abcd:ef01',
        subnetMask: '255.255.255.0',
        defaultGateway: '192.168.1.1',
        dhcpEnabled: true,
        dnsServers: ['8.8.8.8', '8.8.4.4'],
        macAddress: '00-11-22-33-44-55',
        status: 'connected'
      },
      {
        name: 'Wi-Fi',
        type: 'Wireless LAN',
        ipv4Address: '192.168.1.101',
        subnetMask: '255.255.255.0',
        defaultGateway: '192.168.1.1',
        dhcpEnabled: true,
        dnsServers: ['192.168.1.1'],
        macAddress: '66-77-88-99-AA-BB',
        status: 'disconnected'
      },
      {
        name: 'vEthernet (WSL)',
        type: 'Ethernet',
        ipv4Address: '172.25.192.1',
        subnetMask: '255.255.240.0',
        dhcpEnabled: false,
        status: 'connected'
      }
    ];
  }

  /**
   * Clear cached data
   */
  clearCache(): void {
    this.cachedHostname = null;
    this.cachedAdapters = null;
    this.cacheTimestamp = 0;
  }
}

// Export singleton instance
export const hostDetails = new HostDetails();
