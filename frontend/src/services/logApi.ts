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
  // Get logs with filters (Client-side filtering because backend returns simple array)
  getLogs: async (filters?: LogFilters): Promise<LogResponse> => {
    // 1. Fetch all logs
    const allLogs = await apiClient.get<any[]>('/logs');

    // 2. Filter locally
    let filtered = Array.isArray(allLogs) ? allLogs : [];

    if (filters?.functionId) {
      filtered = filtered.filter(l => l.functionId === filters.functionId);
    }
    if (filters?.level) {
      filtered = filtered.filter(l => l.level?.toLowerCase() === filters.level?.toLowerCase());
    }

    // 3. Pagination (Client-side)
    const total = filtered.length;
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const logs = filtered.slice(offset, offset + limit);

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
    // Fallback to searching global logs
    const allLogs = await apiClient.get<any[]>('/logs');
    if (!Array.isArray(allLogs)) return [];

    return allLogs
      .filter(l => l.functionId === functionId)
      .slice(0, limit);
  },

  // Get single log entry
  getLog: async (id: string): Promise<LogEntry> => {
    // Not supported efficiently, just find in global
    const allLogs = await apiClient.get<any[]>('/logs');
    return allLogs.find((l: any) => l.id === id) as LogEntry;
  },

  // Clear logs for function
  clearFunctionLogs: async (functionId: string): Promise<void> => {
    // Not supported by backend
    console.warn("Clear logs not supported by backend");
    return;
  },
};
