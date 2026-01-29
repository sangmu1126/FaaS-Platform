import { apiClient } from './api';
import type {
  FunctionItem,
  FunctionMetrics,
  DeploymentConfig,
  AutoTunerRecommendation,
  DashboardStats,
} from '../types/function';

export const functionApi = {
  // Get all functions
  getFunctions: async (): Promise<FunctionItem[]> => {
    return apiClient.get<FunctionItem[]>('/functions');
  },

  // Get single function by ID
  getFunction: async (id: string): Promise<FunctionItem> => {
    return apiClient.get<FunctionItem>(`/functions/${id}`);
  },

  // Deploy new function
  deployFunction: async (config: DeploymentConfig): Promise<FunctionItem> => {
    return apiClient.post<FunctionItem>('/functions', config);
  },

  // Update function
  updateFunction: async (
    id: string,
    config: Partial<DeploymentConfig>
  ): Promise<FunctionItem> => {
    return apiClient.put<FunctionItem>(`/functions/${id}`, config);
  },

  // Delete function
  deleteFunction: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/functions/${id}`);
  },

  // Get function metrics
  getMetrics: async (id: string, range?: string): Promise<FunctionMetrics> => {
    const query = range ? `?range=${range}` : '';
    return apiClient.get<FunctionMetrics>(`/functions/${id}/metrics${query}`);
  },

  // Get Auto-Tuner recommendation
  getAutoTunerRecommendation: async (
    id: string
  ): Promise<AutoTunerRecommendation> => {
    return apiClient.get<AutoTunerRecommendation>(
      `/functions/${id}/auto-tuner`
    );
  },

  // Apply Auto-Tuner recommendation
  applyAutoTuner: async (id: string): Promise<FunctionItem> => {
    return apiClient.post<FunctionItem>(`/functions/${id}/auto-tuner/apply`);
  },

  // Get dashboard stats
  getDashboardStats: async (): Promise<DashboardStats> => {
    return apiClient.get<DashboardStats>(`/dashboard/stats?_t=${Date.now()}`);
  },

  // Invoke function
  invokeFunction: async (id: string, payload?: unknown, options?: RequestInit): Promise<unknown> => {
    return apiClient.post('/run', {
      functionId: id,
      inputData: payload
    }, options);
  },

  // Get Async Job Status
  getJobStatus: async (jobId: string): Promise<unknown> => {
    return apiClient.get(`/status/${jobId}`);
  },

  // Load Test Controls
  startLoadTest: async (options?: { mode?: 'capacity' | 'stress', targetId?: string, duration?: number, concurrency?: number }): Promise<void> => {
    // This returns a streaming response, handled differently but we send POST
    return apiClient.post('/loadtest/start', options || {});
  },

  stopLoadTest: async (): Promise<{ success: boolean; message: string }> => {
    return apiClient.post('/loadtest/stop');
  },

  getLoadTestStatus: async (): Promise<{ running: boolean; startedAt: string | null; pid: number | null }> => {
    return apiClient.get('/loadtest/status');
  },
};
