export interface FunctionItem {
  id: string;
  name: string;
  language: 'python' | 'nodejs' | 'cpp' | 'go';
  runtime: string;
  status: 'active' | 'inactive' | 'error';
  memory: number; // Used in DeploymentConfig
  memoryMb?: number; // Used in some API responses
  timeout: number;
  executions: number;
  invocations?: number; // Alias
  avgResponseTime: number;
  lastExecuted: string;
  createdAt: string;
  endpoint: string;
  uploadedAt?: string;
}

export interface FunctionMetrics {
  executions: number;
  invocations?: number;
  avgResponseTime: number;
  avgDuration?: number;
  coldStarts: number;
  errors: number;
  successRate: number;
  totalCost: number;
  recentExecutions?: any[];
}

export interface LogEntry {
  id: string;
  functionId: string;
  functionName: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  duration: number;
  memory: number;
  status: 'success' | 'error';
}

export interface DeploymentConfig {
  name: string;
  language: 'python' | 'nodejs' | 'cpp' | 'go';
  runtime: string;
  memory: number;
  timeout: number;
  code: string;
  environment?: Record<string, string>;
}

export interface AutoTunerRecommendation {
  currentMemory: number;
  recommendedMemory: number;
  currentCost: number;
  estimatedCost: number;
  savings: number;
  savingsPercentage: number;
}

export interface DashboardStats {
  totalFunctions: number;
  totalExecutions: number;
  avgResponseTime: number;
  monthlyCost: number;
}
