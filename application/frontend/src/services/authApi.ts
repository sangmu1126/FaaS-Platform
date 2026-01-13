import { apiClient } from './api';
import type {
  User,
  LoginCredentials,
  RegisterData,
  AuthResponse,
} from '../types/auth';

export const authApi = {
  // Login
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      '/auth/login',
      credentials
    );
    apiClient.setToken(response.token);
    return response;
  },

  // Register
  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    apiClient.setToken(response.token);
    return response;
  },

  // Logout
  logout: async (): Promise<void> => {
    await apiClient.post<void>('/auth/logout');
    apiClient.setToken(null);
  },

  // Get current user
  getCurrentUser: async (): Promise<User> => {
    return apiClient.get<User>('/auth/me');
  },

  // Update profile
  updateProfile: async (data: Partial<User>): Promise<User> => {
    return apiClient.put<User>('/auth/profile', data);
  },

  // Change password
  changePassword: async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    return apiClient.post<void>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  },

  // Request password reset
  requestPasswordReset: async (email: string): Promise<void> => {
    return apiClient.post<void>('/auth/forgot-password', { email });
  },

  // Reset password
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    return apiClient.post<void>('/auth/reset-password', {
      token,
      newPassword,
    });
  },
};
