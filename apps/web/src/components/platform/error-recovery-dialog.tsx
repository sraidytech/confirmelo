'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  AlertTriangle, 
  RefreshCw, 
  ExternalLink, 
  Shield, 
  Clock, 
  Wifi, 
  Key,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';

export enum ErrorType {
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  SPREADSHEET_NOT_FOUND = 'SPREADSHEET_NOT_FOUND',
  SPREADSHEET_ACCESS_DENIED = 'SPREADSHEET_ACCESS_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  code?: string;
  details?: any;
  connectionId?: string;
  spreadsheetId?: string;
  timestamp: string;
}

interface ErrorRecoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  error: ErrorDetails;
  onRetry?: () => void;
  onRecovered?: () => void;
}

interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => Promise<void>;
  primary?: boolean;
}

export function ErrorRecoveryDialog({
  isOpen,
  onClose,
  error,
  onRetry,
  onRecovered,
}: ErrorRecoveryDialogProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<string | null>(null);
  const { toast } = useToast();

  const getErrorIcon = (type: ErrorType) => {
    switch (type) {
      case ErrorType.TOKEN_EXPIRED:
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case ErrorType.TOKEN_REVOKED:
        return <XCircle className="h-5 w-5 text-red-600" />;
      case ErrorType.INSUFFICIENT_PERMISSIONS:
        return <Shield className="h-5 w-5 text-orange-600" />;
      case ErrorType.NETWORK_ERROR:
        return <Wifi className="h-5 w-5 text-blue-600" />;
      case ErrorType.RATE_LIMITED:
        return <Clock className="h-5 w-5 text-purple-600" />;
      case ErrorType.SPREADSHEET_NOT_FOUND:
      case ErrorType.SPREADSHEET_ACCESS_DENIED:
        return <Shield className="h-5 w-5 text-red-600" />;
      case ErrorType.QUOTA_EXCEEDED:
        return <AlertTriangle className="h-5 w-5 text-orange-600" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-600" />;
    }
  };

  const getErrorSeverity = (type: ErrorType): 'info' | 'warning' | 'error' => {
    switch (type) {
      case ErrorType.NETWORK_ERROR:
      case ErrorType.RATE_LIMITED:
        return 'warning';
      case ErrorType.TOKEN_EXPIRED:
        return 'warning';
      case ErrorType.TOKEN_REVOKED:
      case ErrorType.INSUFFICIENT_PERMISSIONS:
      case ErrorType.SPREADSHEET_ACCESS_DENIED:
        return 'error';
      default:
        return 'info';
    }
  };

  const handleReauthenticate = async () => {
    if (!error.connectionId) return;
    
    setIsRecovering(true);
    setRecoveryStep('Initiating re-authentication...');
    
    try {
      const response = await api.post(`/auth/oauth2/google-sheets/connections/${error.connectionId}/reauthorize`);
      
      if (response.data.authorizationUrl) {
        setRecoveryStep('Redirecting to Google...');
        // Redirect to Google OAuth
        window.location.href = response.data.authorizationUrl;
      }
    } catch (err: any) {
      toast({
        title: 'Re-authentication Failed',
        description: err.message || 'Could not initiate re-authentication.',
        variant: 'destructive',
      });
    } finally {
      setIsRecovering(false);
      setRecoveryStep(null);
    }
  };

  const handleRefreshToken = async () => {
    if (!error.connectionId) return;
    
    setIsRecovering(true);
    setRecoveryStep('Refreshing access token...');
    
    try {
      await api.post(`/auth/oauth2/google-sheets/connections/${error.connectionId}/refresh-token`);
      
      toast({
        title: 'Token Refreshed',
        description: 'Access token has been successfully refreshed.',
      });
      
      onRecovered?.();
      onClose();
    } catch (err: any) {
      toast({
        title: 'Token Refresh Failed',
        description: err.message || 'Could not refresh the access token.',
        variant: 'destructive',
      });
    } finally {
      setIsRecovering(false);
      setRecoveryStep(null);
    }
  };

  const handleRetryOperation = async () => {
    setIsRecovering(true);
    setRecoveryStep('Retrying operation...');
    
    try {
      if (onRetry) {
        await onRetry();
        onRecovered?.();
        onClose();
      }
    } catch (err: any) {
      toast({
        title: 'Retry Failed',
        description: err.message || 'The retry operation failed.',
        variant: 'destructive',
      });
    } finally {
      setIsRecovering(false);
      setRecoveryStep(null);
    }
  };

  const handleTestConnection = async () => {
    if (!error.connectionId) return;
    
    setIsRecovering(true);
    setRecoveryStep('Testing connection...');
    
    try {
      const result = await api.post(`/auth/oauth2/google-sheets/connections/${error.connectionId}/test`);
      
      if (result.data.success) {
        toast({
          title: 'Connection Test Successful',
          description: 'The connection is now working properly.',
        });
        onRecovered?.();
        onClose();
      } else {
        toast({
          title: 'Connection Test Failed',
          description: result.data.error || 'The connection is still not working.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Connection Test Failed',
        description: err.message || 'Could not test the connection.',
        variant: 'destructive',
      });
    } finally {
      setIsRecovering(false);
      setRecoveryStep(null);
    }
  };

  const getRecoveryActions = (): RecoveryAction[] => {
    const actions: RecoveryAction[] = [];

    switch (error.type) {
      case ErrorType.TOKEN_EXPIRED:
        actions.push({
          id: 'refresh-token',
          label: 'Refresh Token',
          description: 'Automatically refresh the expired access token',
          icon: <RefreshCw className="h-4 w-4" />,
          action: handleRefreshToken,
          primary: true,
        });
        actions.push({
          id: 'reauth',
          label: 'Re-authenticate',
          description: 'Sign in again with Google to get a new token',
          icon: <Key className="h-4 w-4" />,
          action: handleReauthenticate,
        });
        break;

      case ErrorType.TOKEN_REVOKED:
        actions.push({
          id: 'reauth',
          label: 'Re-authenticate',
          description: 'Sign in again with Google to restore access',
          icon: <Key className="h-4 w-4" />,
          action: handleReauthenticate,
          primary: true,
        });
        break;

      case ErrorType.INSUFFICIENT_PERMISSIONS:
        actions.push({
          id: 'reauth',
          label: 'Grant Permissions',
          description: 'Re-authenticate to grant the required permissions',
          icon: <Shield className="h-4 w-4" />,
          action: handleReauthenticate,
          primary: true,
        });
        break;

      case ErrorType.NETWORK_ERROR:
        actions.push({
          id: 'retry',
          label: 'Retry',
          description: 'Try the operation again',
          icon: <RefreshCw className="h-4 w-4" />,
          action: handleRetryOperation,
          primary: true,
        });
        actions.push({
          id: 'test',
          label: 'Test Connection',
          description: 'Check if the connection is working',
          icon: <Wifi className="h-4 w-4" />,
          action: handleTestConnection,
        });
        break;

      case ErrorType.RATE_LIMITED:
        actions.push({
          id: 'retry',
          label: 'Retry Later',
          description: 'Wait a moment and try again',
          icon: <Clock className="h-4 w-4" />,
          action: handleRetryOperation,
          primary: true,
        });
        break;

      case ErrorType.SPREADSHEET_NOT_FOUND:
      case ErrorType.SPREADSHEET_ACCESS_DENIED:
        actions.push({
          id: 'test',
          label: 'Test Connection',
          description: 'Verify the spreadsheet is accessible',
          icon: <CheckCircle className="h-4 w-4" />,
          action: handleTestConnection,
          primary: true,
        });
        break;

      default:
        actions.push({
          id: 'retry',
          label: 'Retry',
          description: 'Try the operation again',
          icon: <RefreshCw className="h-4 w-4" />,
          action: handleRetryOperation,
          primary: true,
        });
        actions.push({
          id: 'test',
          label: 'Test Connection',
          description: 'Check if the connection is working',
          icon: <CheckCircle className="h-4 w-4" />,
          action: handleTestConnection,
        });
        break;
    }

    return actions;
  };

  const getErrorTitle = (type: ErrorType): string => {
    switch (type) {
      case ErrorType.TOKEN_EXPIRED:
        return 'Access Token Expired';
      case ErrorType.TOKEN_REVOKED:
        return 'Access Revoked';
      case ErrorType.INSUFFICIENT_PERMISSIONS:
        return 'Insufficient Permissions';
      case ErrorType.NETWORK_ERROR:
        return 'Network Connection Error';
      case ErrorType.RATE_LIMITED:
        return 'Rate Limit Exceeded';
      case ErrorType.SPREADSHEET_NOT_FOUND:
        return 'Spreadsheet Not Found';
      case ErrorType.SPREADSHEET_ACCESS_DENIED:
        return 'Access Denied';
      case ErrorType.QUOTA_EXCEEDED:
        return 'Quota Exceeded';
      default:
        return 'Connection Error';
    }
  };

  const getErrorGuidance = (type: ErrorType): string => {
    switch (type) {
      case ErrorType.TOKEN_EXPIRED:
        return 'Your Google Sheets access token has expired. You can refresh it automatically or re-authenticate.';
      case ErrorType.TOKEN_REVOKED:
        return 'Access to your Google account has been revoked. Please re-authenticate to restore the connection.';
      case ErrorType.INSUFFICIENT_PERMISSIONS:
        return 'The current permissions are not sufficient for this operation. Please re-authenticate to grant the required permissions.';
      case ErrorType.NETWORK_ERROR:
        return 'There was a network error while connecting to Google Sheets. Please check your internet connection and try again.';
      case ErrorType.RATE_LIMITED:
        return 'Too many requests have been made to Google Sheets API. Please wait a moment before trying again.';
      case ErrorType.SPREADSHEET_NOT_FOUND:
        return 'The requested spreadsheet could not be found. It may have been deleted or moved.';
      case ErrorType.SPREADSHEET_ACCESS_DENIED:
        return 'You do not have permission to access this spreadsheet. Please ensure it is shared with your Google account.';
      case ErrorType.QUOTA_EXCEEDED:
        return 'Your Google Sheets API quota has been exceeded. Please try again later or contact support.';
      default:
        return 'An unexpected error occurred. Please try the suggested recovery actions.';
    }
  };

  const recoveryActions = getRecoveryActions();
  const severity = getErrorSeverity(error.type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            {getErrorIcon(error.type)}
            <DialogTitle>{getErrorTitle(error.type)}</DialogTitle>
          </div>
          <DialogDescription>
            {getErrorGuidance(error.type)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Details */}
          <Alert variant={severity === 'error' ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">{error.message}</p>
                {error.code && (
                  <p className="text-xs text-gray-600">Error Code: {error.code}</p>
                )}
                {error.details && (
                  <details className="text-xs">
                    <summary className="cursor-pointer hover:text-gray-800">
                      Technical Details
                    </summary>
                    <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                      {JSON.stringify(error.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>

          {/* Recovery Progress */}
          {isRecovering && recoveryStep && (
            <Alert>
              <LoadingSpinner className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center space-x-2">
                  <span>{recoveryStep}</span>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Recovery Actions */}
          {!isRecovering && recoveryActions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-900">Recovery Actions</h4>
              <div className="space-y-2">
                {recoveryActions.map((action) => (
                  <Button
                    key={action.id}
                    variant={action.primary ? 'default' : 'outline'}
                    className="w-full justify-start"
                    onClick={action.action}
                    disabled={isRecovering}
                  >
                    <div className="flex items-center space-x-3">
                      {action.icon}
                      <div className="text-left">
                        <p className="font-medium">{action.label}</p>
                        <p className="text-xs text-gray-600">{action.description}</p>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Additional Help */}
          <div className="text-xs text-gray-600 space-y-1">
            <p>
              <Info className="h-3 w-3 inline mr-1" />
              If the problem persists, please contact support.
            </p>
            <p>Error occurred at: {new Date(error.timestamp).toLocaleString()}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRecovering}>
            {isRecovering ? 'Please Wait...' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}