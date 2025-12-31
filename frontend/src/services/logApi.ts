import { apiClient } from './api';
import type { LogEntry } from '../types/function';

interface LogFilters {
  functionId?: string;
  level?: 'info' | 'warning' | 'error';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface LogResponse {
  logs: LogEntry[];
  total: number;
  hasMore: boolean;
}

export const logApi = {
  getLogs: async (filters?: LogFilters): Promise<LogResponse> => {
    // Filtered Logs
    if (filters?.functionId && filters.functionId !== 'all') {
      const logs = await logApi.getFunctionLogs(filters.functionId, filters.limit || 50);
      return {
        logs,
        total: logs.length, // DynamoDB query doesn't return total count easily without scan
        hasMore: logs.length >= (filters.limit || 50)
      };
    }

    // Global Logs (Memory)
    const allLogs = await apiClient.get<any[]>('/logs');

    let filtered = Array.isArray(allLogs) ? allLogs : [];

    if (filters?.level) {
      filtered = filtered.filter(l => l.level?.toLowerCase() === filters.level?.toLowerCase());
    }

    // Pagination
    const total = filtered.length;
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const logs = filtered.slice(offset, offset + limit).map((l: any) => ({
      id: l.id,
      timestamp: l.timestamp,
      functionId: l.functionId,
      functionName: l.functionId, // Name not available in simple log
      level: l.level || 'info',
      message: l.msg || l.message,
      duration: l.duration || 0,
      memory: l.memory || 0,
      requestId: l.requestId,
      status: (l.status || 'INFO') as any
    }));

    return {
      logs,
      total,
      hasMore: offset + limit < total
    };
  },

  // Get logs for specific function
  getFunctionLogs: async (
    functionId: string,
    limit = 50
  ): Promise<LogEntry[]> => {
    // Use dedicated endpoint for execution history
    const response = await apiClient.get<any[]>(`/functions/${functionId}/logs?limit=${limit}`);

    if (!Array.isArray(response)) return [];

    // Transform if needed (Backend returns correctly formatted objects mostly)
    return response.map((log: any) => ({
      id: log.id || log.requestId || Math.random().toString(),
      functionId: functionId, // From argument
      functionName: "Unknown", // Metadata not in log
      time: new Date(log.timestamp || Date.now()).toLocaleTimeString(),
      timestamp: log.timestamp || new Date().toISOString(),
      type: log.status === 'SUCCESS' ? 'warm' : 'pool', // UI mapping hack
      level: (log.status === 'ERROR' || log.status === 'TIMEOUT') ? 'error' : 'info',
      message: log.message || "No output",
      duration: log.duration || 0,
      memory: log.memory || 0,
      status: (log.status === 'SUCCESS' ? 'success' : 'error') as 'success' | 'error'
    }));
  },

  // Get single log entry
  getLog: async (id: string): Promise<LogEntry> => {
    // Not supported efficiently, just find in global
    const allLogs = await apiClient.get<any[]>('/logs');
    return allLogs.find((l: any) => l.id === id) as LogEntry;
  },

  // Clear logs for function
  clearFunctionLogs: async (_functionId: string): Promise<void> => {
    // Not supported by backend
    console.warn("Clear logs not supported by backend");
    return;
  },

  // Get full log detail (on-demand)
  getLogDetail: async (functionId: string, requestId: string): Promise<string> => {
    try {
      const response = await apiClient.get<any>(`/functions/${functionId}/logs/${requestId}`);
      return response.message || "No content.";
    } catch (e) {
      console.error("Failed to fetch log detail", e);
      return "Failed to load detailed log.";
    }
  }
};
