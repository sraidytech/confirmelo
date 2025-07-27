import axios, { AxiosInstance, AxiosError } from 'axios';
import Cookies from 'js-cookie';
import { 
  LoginCredentials, 
  RegisterData, 
  AuthResult, 
  PasswordResetRequest,
  PasswordResetConfirm,
  ChangePasswordRequest,
  ApiError 
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

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, redirect to login
            this.clearTokens();
            if (typeof window !== 'undefined') {
              window.location.href = '/auth/login';
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
      throw this.handleApiError(error as AxiosError);
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
}

export const apiClient = new ApiClient();