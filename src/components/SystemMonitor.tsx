import React, { useEffect, useState } from 'react';
import { taskController } from '../core/TaskController';

interface SystemMetrics {
  process: {
    cpuPercent: number;
    memoryMb: number;
    memoryPercent: number;
    pid: number;
  };
  system: {
    cpuPercent: number;
    cpuCores: number;
    cpuLogicalCores: number;
    memoryTotalGb: number;
    memoryUsedGb: number;
    memoryPercent: number;
  };
}

interface FrontendMetrics {
  usedJSHeapSizeMb: number;
  totalJSHeapSizeMb: number;
  jsHeapPercent: number;
}

export const SystemMonitor: React.FC = () => {
  const [workerStatus, setWorkerStatus] = useState({ total: 0, idle: 0, busy: 0 });
  const [showResourceUsage, setShowResourceUsage] = useState(false);
  const [backendMetrics, setBackendMetrics] = useState<SystemMetrics | null>(null);
  const [frontendMetrics, setFrontendMetrics] = useState<FrontendMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setWorkerStatus(taskController.getWorkerStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch metrics when resource usage panel is shown
  useEffect(() => {
    if (!showResourceUsage) return;

    const fetchMetrics = async () => {
      setIsLoading(true);
      setMetricsError(null);
      
      try {
        // Fetch backend metrics from MCP server
        const response = await fetch('http://localhost:8765/api/system/metrics');
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setBackendMetrics(data);
          } else {
            setMetricsError(data.error || 'Failed to fetch backend metrics');
          }
        } else {
          setMetricsError('MCP server not responding');
        }
      } catch (err) {
        setMetricsError('Could not connect to MCP server');
      }

      // Get frontend metrics using Performance API
      try {
        const perf = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } });
        if (perf.memory) {
          const usedMb = perf.memory.usedJSHeapSize / (1024 * 1024);
          const totalMb = perf.memory.totalJSHeapSize / (1024 * 1024);
          setFrontendMetrics({
            usedJSHeapSizeMb: Math.round(usedMb * 10) / 10,
            totalJSHeapSizeMb: Math.round(totalMb * 10) / 10,
            jsHeapPercent: Math.round((usedMb / totalMb) * 100)
          });
        }
      } catch {
        // Performance.memory may not be available in all browsers
      }

      setIsLoading(false);
    };

    fetchMetrics();
    const metricsInterval = setInterval(fetchMetrics, 2000);

    return () => clearInterval(metricsInterval);
  }, [showResourceUsage]);

  const utilizationPercent = workerStatus.total > 0
    ? Math.round((workerStatus.busy / workerStatus.total) * 100)
    : 0;

  const getColorClass = (percent: number) => {
    if (percent > 80) return 'text-danger';
    if (percent > 50) return 'text-warning';
    return 'text-success';
  };

  const getProgressClass = (percent: number) => {
    if (percent > 80) return 'progress-danger';
    if (percent > 50) return 'progress-warning';
    return 'progress-info';
  };

  return (
    <div 
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
    >
      {/* Header */}
      <div 
        className="px-4 py-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-secondary)' }}
      >
        <span className="text-xl">⚙️</span>
        <h3 className="font-semibold text-primary">System Monitor</h3>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="stat-value">{workerStatus.total}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-success">{workerStatus.idle}</div>
            <div className="stat-label">Idle</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-info">{workerStatus.busy}</div>
            <div className="stat-label">Busy</div>
          </div>
        </div>

        {/* Worker utilization bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted mb-2">
            <span>Worker Utilization</span>
            <span className={`font-medium ${
              utilizationPercent > 80 ? 'text-danger' :
              utilizationPercent > 50 ? 'text-warning' : 'text-success'
            }`}>
              {utilizationPercent}%
            </span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${
                utilizationPercent > 80 ? 'progress-danger' :
                utilizationPercent > 50 ? 'progress-warning' : 'progress-info'
              }`}
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>
        </div>

        {/* Resource Usage Toggle Button */}
        <button
          onClick={() => setShowResourceUsage(!showResourceUsage)}
          className="w-full py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
          style={{ 
            background: showResourceUsage ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
            color: showResourceUsage ? 'white' : 'var(--text-secondary)'
          }}
        >
          <span>📊</span>
          {showResourceUsage ? 'Hide Resource Usage' : 'Show Resource Usage'}
        </button>

        {/* Resource Usage Panel */}
        {showResourceUsage && (
          <div className="space-y-4 animate-fade-in">
            {isLoading && !backendMetrics && (
              <div className="text-center text-muted text-sm py-2">
                Loading metrics...
              </div>
            )}

            {metricsError && (
              <div className="text-center text-warning text-sm py-2 px-3 rounded-lg" style={{ background: 'rgba(255,193,7,0.1)' }}>
                ⚠️ {metricsError}
              </div>
            )}

            {/* MCP Server Metrics */}
            {backendMetrics && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <span>🐍</span>
                  <span>MCP Server (PID: {backendMetrics.process.pid})</span>
                </div>

                {/* Server CPU */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>CPU Usage</span>
                    <span className={`font-medium ${getColorClass(backendMetrics.process.cpuPercent)}`}>
                      {backendMetrics.process.cpuPercent}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(backendMetrics.process.cpuPercent)}`}
                      style={{ width: `${Math.min(backendMetrics.process.cpuPercent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Server Memory */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>Memory ({backendMetrics.process.memoryMb} MB)</span>
                    <span className={`font-medium ${getColorClass(backendMetrics.process.memoryPercent)}`}>
                      {backendMetrics.process.memoryPercent}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(backendMetrics.process.memoryPercent)}`}
                      style={{ width: `${backendMetrics.process.memoryPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Frontend Metrics */}
            {frontendMetrics && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <span>⚛️</span>
                  <span>React Frontend</span>
                </div>

                {/* JS Heap */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>JS Heap ({frontendMetrics.usedJSHeapSizeMb} / {frontendMetrics.totalJSHeapSizeMb} MB)</span>
                    <span className={`font-medium ${getColorClass(frontendMetrics.jsHeapPercent)}`}>
                      {frontendMetrics.jsHeapPercent}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(frontendMetrics.jsHeapPercent)}`}
                      style={{ width: `${frontendMetrics.jsHeapPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {!frontendMetrics && (
              <div className="text-xs text-muted text-center">
                Frontend memory info not available in this browser
              </div>
            )}

            {/* System-wide Metrics */}
            {backendMetrics && (
              <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border-secondary)' }}>
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <span>💻</span>
                  <span>System ({backendMetrics.system.cpuLogicalCores} cores)</span>
                </div>

                {/* System CPU */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>Total CPU</span>
                    <span className={`font-medium ${getColorClass(backendMetrics.system.cpuPercent)}`}>
                      {backendMetrics.system.cpuPercent}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(backendMetrics.system.cpuPercent)}`}
                      style={{ width: `${backendMetrics.system.cpuPercent}%` }}
                    />
                  </div>
                </div>

                {/* System Memory */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>Total RAM ({backendMetrics.system.memoryUsedGb} / {backendMetrics.system.memoryTotalGb} GB)</span>
                    <span className={`font-medium ${getColorClass(backendMetrics.system.memoryPercent)}`}>
                      {backendMetrics.system.memoryPercent}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${getProgressClass(backendMetrics.system.memoryPercent)}`}
                      style={{ width: `${backendMetrics.system.memoryPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
