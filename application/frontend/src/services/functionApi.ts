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
  getMetrics: async (id: string): Promise<FunctionMetrics> => {
    return apiClient.get<FunctionMetrics>(`/functions/${id}/metrics`);
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
    return apiClient.get<DashboardStats>('/dashboard/stats');
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
};
