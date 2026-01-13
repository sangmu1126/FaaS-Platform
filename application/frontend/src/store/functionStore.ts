import { create } from 'zustand';
import type { FunctionItem, DashboardStats } from '../types/function';
import { functionApi } from '../services/functionApi';

interface FunctionStore {
  functions: FunctionItem[];
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  
  fetchFunctions: () => Promise<void>;
  fetchStats: () => Promise<void>;
  addFunction: (func: FunctionItem) => void;
  updateFunction: (id: string, updates: Partial<FunctionItem>) => void;
  removeFunction: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFunctionStore = create<FunctionStore>((set) => ({
  functions: [],
  stats: null,
  isLoading: false,
  error: null,

  fetchFunctions: async () => {
    set({ isLoading: true, error: null });
    try {
      const functions = await functionApi.getFunctions();
      set({ functions, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch functions',
        isLoading: false,
      });
    }
  },

  fetchStats: async () => {
    try {
      const stats = await functionApi.getDashboardStats();
      set({ stats });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch stats',
      });
    }
  },

  addFunction: (func) =>
    set((state) => ({
      functions: [...state.functions, func],
    })),

  updateFunction: (id, updates) =>
    set((state) => ({
      functions: state.functions.map((func) =>
        func.id === id ? { ...func, ...updates } : func
      ),
    })),

  removeFunction: (id) =>
    set((state) => ({
      functions: state.functions.filter((func) => func.id !== id),
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),
}));
