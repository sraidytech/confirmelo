import axios, { AxiosInstance, AxiosError } from 'axios';
import Cookies from 'js-cookie';
import { 
  LoginCredentials, 
  RegisterData, 
  AuthResult, 
  PasswordResetRequest,
  PasswordResetConfirm,
  ChangePasswordRequest,
  ApiError,
  UpdateProfileDto,
  UpdateUserStatusDto,
  UserPresence,
  BulkUserPresence,
  OnlineUsersResponse,
  UserActivitySummary,
  AvatarUploadResponse
} from '@/types/auth';
import { generateCorrelationId } from './utils';

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token and correlation ID
    this.client.interceptors.request.use(
      (config) => {
        const token = Cookies.get('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add correlation ID for request tracing
        config.headers['X-Correlation-ID'] = generateCorrelationId();

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Only handle 401 errors, not network errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Only redirect on confirmed auth errors, not network errors
            const apiError = this.handleApiError(refreshError as AxiosError);
            if (apiError.type !== 'NETWORK_ERROR') {
              this.clearTokens();
              if (typeof window !== 'undefined') {
                window.location.href = '/auth/login';
              }
            }
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();
    
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<string> {
    const refreshToken = Cookies.get('refreshToken');
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/refresh`,
        { refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': generateCorrelationId(),
          },
        }
      );

      const { accessToken, refreshToken: newRefreshToken } = response.data.tokens;
      
      this.setTokens(accessToken, newRefreshToken);
      return accessToken;
    } catch (error) {
      this.clearTokens();
      throw error;
    }
  }

  private handleApiError(error: AxiosError): ApiError {
    if (error.response?.data) {
      return error.response.data as ApiError;
    }

    return {
      type: 'NETWORK_ERROR',
      message: error.message || 'Network error occurred',
      code: 'NETWORK_ERROR',
      correlationId: generateCorrelationId(),
    };
  }

  private setTokens(accessToken: string, refreshToken: string, rememberMe = false) {
    const options = rememberMe ? { expires: 30 } : { expires: 7 };
    
    Cookies.set('accessToken', accessToken, { expires: 1/96 }); // 15 minutes
    Cookies.set('refreshToken', refreshToken, options);
  }

  private clearTokens() {
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
  }

  // Authentication endpoints
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const response = await this.client.post('/auth/login', credentials);
      const result: AuthResult = response.data;
      
      this.setTokens(
        result.tokens.accessToken, 
        result.tokens.refreshToken,
        credentials.rememberMe
      );
      
      return result;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async register(data: RegisterData): Promise<AuthResult> {
    try {
      const response = await this.client.post('/auth/register', data);
      const result: AuthResult = response.data;
      
      this.setTokens(result.tokens.accessToken, result.tokens.refreshToken);
      
      return result;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API call failed:', error);
    } finally {
      this.clearTokens();
    }
  }

  async refreshToken(): Promise<void> {
    await this.refreshAccessToken();
  }

  async resetPassword(data: PasswordResetRequest): Promise<void> {
    try {
      await this.client.post('/auth/forgot-password', data);
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async confirmPasswordReset(data: PasswordResetConfirm): Promise<void> {
    try {
      await this.client.post('/auth/reset-password', data);
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    try {
      await this.client.put('/auth/change-password', data);
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getCurrentUser() {
    try {
      const response = await this.client.get('/auth/me');
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      // Don't try to refresh token here, let the interceptor handle it
      throw this.handleApiError(axiosError);
    }
  }

  async validateResetToken(token: string): Promise<boolean> {
    try {
      await this.client.get(`/auth/validate-reset-token?token=${token}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  // User Management endpoints
  async getUserProfile() {
    try {
      const response = await this.client.get('/users/profile');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async updateProfile(data: any) {
    try {
      const response = await this.client.put('/users/profile', data);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async changeUserPassword(data: { currentPassword: string; newPassword: string }) {
    try {
      const response = await this.client.post('/users/change-password', data);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async updateAvatar(avatarUrl: string) {
    try {
      const response = await this.client.put('/users/avatar', { avatarUrl });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async updateActivity() {
    try {
      const response = await this.client.post('/users/activity');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getOnlineStatus() {
    try {
      const response = await this.client.get('/users/online-status');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async updateUserStatus(userId: string, data: any) {
    try {
      const response = await this.client.put(`/users/${userId}/status`, data);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getUserPresence(userId: string) {
    try {
      const response = await this.client.get(`/users/${userId}/presence`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getBulkUserPresence(userIds: string[]) {
    try {
      const response = await this.client.post('/users/presence/bulk', { userIds });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getOnlineUsersInOrganization() {
    try {
      const response = await this.client.get('/users/organization/online');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getUserActivitySummary(userId: string) {
    try {
      const response = await this.client.get(`/users/${userId}/activity-summary`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  // Session Management endpoints
  async getSessions(includeExpired = false) {
    try {
      const response = await this.client.get(`/auth/sessions?includeExpired=${includeExpired}`);
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getSessionStats() {
    try {
      const response = await this.client.get('/auth/sessions/stats');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async getSessionActivity() {
    try {
      const response = await this.client.get('/auth/sessions/activity');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async terminateSession(sessionId: string, reason?: string) {
    try {
      const response = await this.client.delete(`/auth/sessions/${sessionId}`, {
        data: { reason: reason || 'Terminated by user' }
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async terminateAllSessions() {
    try {
      const response = await this.client.delete('/auth/sessions/all');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  // Admin endpoints
  async getAdminUsers() {
    try {
      const response = await this.client.get('/admin/users');
      return response.data;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  // Generic HTTP methods for backward compatibility
  async get(url: string, config?: any) {
    try {
      const response = await this.client.get(url, config);
      return response;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async post(url: string, data?: any, config?: any) {
    try {
      const response = await this.client.post(url, data, config);
      return response;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async put(url: string, data?: any, config?: any) {
    try {
      const response = await this.client.put(url, data, config);
      return response;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }

  async delete(url: string, config?: any) {
    try {
      const response = await this.client.delete(url, config);
      return response;
    } catch (error) {
      throw this.handleApiError(error as AxiosError);
    }
  }
}

export const apiClient = new ApiClient();
export const api = apiClient;