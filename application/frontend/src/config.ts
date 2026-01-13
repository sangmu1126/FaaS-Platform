export const CONFIG = {
    // Read API URL from environment variables (.env)
    // If not set, default to localhost for development
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api',
    API_KEY: import.meta.env.VITE_API_KEY || 'test-api-key',
};
