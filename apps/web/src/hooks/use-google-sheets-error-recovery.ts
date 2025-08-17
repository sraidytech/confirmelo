'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ErrorType, ErrorDetails } from '@/components/platform/error-recovery-dialog';

interface UseGoogleSheetsErrorRecoveryOptions {
  onRecovered?: () => void;
  onRetryFailed?: (error: any) => void;
}

export function useGoogleSheetsErrorRecovery(options: UseGoogleSheetsErrorRecoveryOptions = {}) {
  const [currentError, setCurrentError] = useState<ErrorDetails | null>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const { toast } = useToast();

  const handleError = useCallback((error: any, type?: ErrorType, connectionId?: string) => {
    const errorType = type || categorizeError(error);
    
    const errorDetails: ErrorDetails = {
      type: errorType,
      message: error.message || 'An unexpected error occurred',
      connectionId,
      timestamp: new Date().toISOString(),
      code: error.code || error.response?.status?.toString(),
      details: error.response?.data || error.details,
    };
    
    setCurrentError(errorDetails);
    setShowErrorDialog(true);
  }, []);

  const categorizeError = (error: any): ErrorType => {
    const message = error.message?.toLowerCase() || '';
    const status = error.response?.status;
    const code = error.code;

    // Token-related errors
    if (message.includes('token expired') || status === 401) {
      return ErrorType.TOKEN_EXPIRED;
    }
    
    if (message.includes('token revoked') || message.includes('invalid_grant')) {
      return ErrorType.TOKEN_REVOKED;
    }
    
    // Permission errors
    if (message.includes('insufficient') || message.includes('permission') || status === 403) {
      return ErrorType.INSUFFICIENT_PERMISSIONS;
    }
    
    // Network errors
    if (code === 'NETWORK_ERROR' || message.includes('network') || !status) {
      return ErrorType.NETWORK_ERROR;
    }
    
    // Rate limiting
    if (status === 429 || message.includes('rate limit')) {
      return ErrorType.RATE_LIMITED;
    }
    
    // Spreadsheet-specific errors
    if (status === 404) {
      return ErrorType.SPREADSHEET_NOT_FOUND;
    }
    
    // Quota errors
    if (message.includes('quota') || message.includes('limit exceeded')) {
      return ErrorType.QUOTA_EXCEEDED;
    }

    return ErrorType.UNKNOWN_ERROR;
  };

  const handleRetry = useCallback(async (retryFn?: () => Promise<void>) => {
    if (!retryFn) return;
    
    setIsRecovering(true);
    try {
      await retryFn();
      toast({
        title: 'Operation Successful',
        description: 'The operation completed successfully.',
      });
      options.onRecovered?.();
    } catch (error: any) {
      options.onRetryFailed?.(error);
      toast({
        title: 'Retry Failed',
        description: error.message || 'The retry operation failed.',
        variant: 'destructive',
      });
    } finally {
      setIsRecovering(false);
    }
  }, [toast, options]);

  const closeErrorDialog = useCallback(() => {
    setShowErrorDialog(false);
    setCurrentError(null);
  }, []);

  const handleRecovered = useCallback(() => {
    toast({
      title: 'Error Recovered',
      description: 'The connection issue has been resolved.',
    });
    closeErrorDialog();
    options.onRecovered?.();
  }, [toast, closeErrorDialog, options]);

  return {
    currentError,
    showErrorDialog,
    isRecovering,
    handleError,
    handleRetry,
    closeErrorDialog,
    handleRecovered,
  };
}