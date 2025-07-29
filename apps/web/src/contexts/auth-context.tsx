'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';
import { 
  User, 
  AuthContextType, 
  LoginCredentials, 
  RegisterData,
  ApiError 
} from '@/types/auth';
import { useToast } from '@/hooks/use-toast';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const accessToken = Cookies.get('accessToken');
      const refreshToken = Cookies.get('refreshToken');

      console.log('Auth initialization - tokens:', { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken 
      });

      if (!accessToken && !refreshToken) {
        console.log('No tokens found, skipping auth initialization');
        setLoading(false);
        return;
      }

      // Try to get current user
      try {
        console.log('Attempting to get current user...');
        const userData = await apiClient.getCurrentUser();
        console.log('Successfully got user data:', userData);
        setUser(userData);
      } catch (apiError: any) {
        console.error('Failed to get current user:', apiError);
        
        // Only handle authentication errors, ignore network errors
        if (apiError.type === 'NETWORK_ERROR') {
          console.log('Network error during auth initialization, keeping tokens');
          setLoading(false);
          return;
        }
        
        // If it's a 401 error, try to refresh the token
        if (apiError.response?.status === 401 && refreshToken) {
          console.log('Got 401, attempting token refresh...');
          try {
            await apiClient.refreshToken();
            console.log('Token refresh successful, retrying user fetch...');
            // Try again after refresh
            const userData = await apiClient.getCurrentUser();
            console.log('Successfully got user data after refresh:', userData);
            setUser(userData);
          } catch (refreshError: any) {
            console.error('Token refresh failed during initialization:', refreshError);
            // Only clear tokens if we're sure they're invalid, not on network errors
            if (refreshError.type !== 'NETWORK_ERROR' && 
                (refreshError.response?.status === 401 || refreshError.response?.status === 403)) {
              console.log('Clearing tokens due to auth failure');
              Cookies.remove('accessToken');
              Cookies.remove('refreshToken');
            }
          }
        } else if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          // Only clear tokens for confirmed auth errors, not network errors
          console.log('Clearing tokens due to auth error');
          Cookies.remove('accessToken');
          Cookies.remove('refreshToken');
        }
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      // Don't clear tokens on network errors
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      setLoading(true);
      const result = await apiClient.login(credentials);
      setUser(result.user);
      
      toast({
        title: 'Login Successful',
        description: `Welcome back, ${result.user.firstName}!`,
      });

      return result; // Return result for redirect handling
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description: apiError.message || 'Invalid credentials. Please try again.',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setLoading(true);
      const result = await apiClient.register(data);
      setUser(result.user);
      
      toast({
        title: 'Registration Successful',
        description: 'Your account has been created successfully!',
      });

      return result; // Return result for redirect handling
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: 'destructive',
        title: 'Registration Failed',
        description: apiError.message || 'Failed to create account. Please try again.',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await apiClient.logout();
      setUser(null);
      
      toast({
        title: 'Logged Out',
        description: 'You have been successfully logged out.',
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Clear user state even if API call fails
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshToken = async () => {
    try {
      await apiClient.refreshToken();
      // Optionally refresh user data
      const userData = await apiClient.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Token refresh failed:', error);
      setUser(null);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await apiClient.resetPassword({ email });
      
      toast({
        title: 'Password Reset Sent',
        description: 'Check your email for password reset instructions.',
      });
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: 'destructive',
        title: 'Reset Failed',
        description: apiError.message || 'Failed to send reset email.',
      });
      throw error;
    }
  };

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    try {
      await apiClient.confirmPasswordReset({ token, newPassword });
      
      toast({
        title: 'Password Reset Successful',
        description: 'Your password has been updated successfully.',
      });
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: 'destructive',
        title: 'Reset Failed',
        description: apiError.message || 'Failed to reset password.',
      });
      throw error;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await apiClient.changePassword({ currentPassword, newPassword });
      
      toast({
        title: 'Password Changed',
        description: 'Your password has been updated successfully.',
      });
    } catch (error) {
      const apiError = error as ApiError;
      toast({
        variant: 'destructive',
        title: 'Change Failed',
        description: apiError.message || 'Failed to change password.',
      });
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    refreshToken,
    resetPassword,
    confirmPasswordReset,
    changePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}