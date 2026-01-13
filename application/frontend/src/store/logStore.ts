import { create } from 'zustand';
import type { LogEntry } from '../types/function';
import { logApi } from '../services/logApi';

interface LogStore {
  logs: LogEntry[];
  isLoading: boolean;
  error: string | null;
  filters: {
    functionId?: string;
    level?: 'info' | 'warning' | 'error';
  };
  
  fetchLogs: () => Promise<void>;
  setFilters: (filters: LogStore['filters']) => void;
  clearFilters: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  isLoading: false,
  error: null,
  filters: {},

  fetchLogs: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters } = get();
      const response = await logApi.getLogs(filters);
      set({ logs: response.logs, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch logs',
        isLoading: false,
      });
    }
  },

  setFilters: (filters) => {
    set({ filters });
    get().fetchLogs();
  },

  clearFilters: () => {
    set({ filters: {} });
    get().fetchLogs();
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
