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

      if (!accessToken && !refreshToken) {
        setLoading(false);
        return;
      }

      // Try to get current user
      try {
        const userData = await apiClient.getCurrentUser();
        setUser(userData);
      } catch (apiError: any) {
        console.error('Failed to get current user:', apiError);
        
        // If it's a 401 error, try to refresh the token
        if (apiError.response?.status === 401 && refreshToken) {
          try {
            await apiClient.refreshToken();
            // Try again after refresh
            const userData = await apiClient.getCurrentUser();
            setUser(userData);
          } catch (refreshError) {
            console.error('Token refresh failed during initialization:', refreshError);
            // Clear invalid tokens
            Cookies.remove('accessToken');
            Cookies.remove('refreshToken');
          }
        } else {
          // For other errors, clear tokens
          Cookies.remove('accessToken');
          Cookies.remove('refreshToken');
        }
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      // Clear invalid tokens
      Cookies.remove('accessToken');
      Cookies.remove('refreshToken');
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