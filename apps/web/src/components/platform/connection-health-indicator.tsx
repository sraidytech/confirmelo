'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ConnectionStatus } from '@/types/auth';
import { 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  XCircle, 
  Wifi, 
  WifiOff,
  RefreshCw,
  Shield,
  Zap,
  Activity
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN',
}

export interface ConnectionHealth {
  status: HealthStatus;
  connectionStatus: ConnectionStatus;
  lastChecked: string;
  tokenExpiresAt?: string;
  tokenExpiresIn?: number; // minutes
  lastSuccessfulOperation?: string;
  lastError?: string;
  errorCount: number;
  uptime: number; // percentage
  responseTime?: number; // milliseconds
  quotaUsage?: {
    used: number;
    limit: number;
    resetAt: string;
  };
  warnings: string[];
}

interface ConnectionHealthIndicatorProps {
  connectionId: string;
  className?: string;
  showDetails?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number; // seconds
  onHealthChange?: (health: ConnectionHealth) => void;
}

export function ConnectionHealthIndicator({
  connectionId,
  className,
  showDetails = false,
  autoRefresh = true,
  refreshInterval = 60,
  onHealthChange,
}: ConnectionHealthIndicatorProps) {
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadHealthStatus();
    
    if (autoRefresh) {
      const interval = setInterval(loadHealthStatus, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [connectionId, autoRefresh, refreshInterval]);

  useEffect(() => {
    if (health && onHealthChange) {
      onHealthChange(health);
    }
  }, [health, onHealthChange]);

  const loadHealthStatus = async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    if (!health) setLoading(true);
    
    try {
      const response = await api.get(`/auth/oauth2/google-sheets/connections/${connectionId}/health`);
      setHealth(response.data);
    } catch (error: any) {
      // If health endpoint doesn't exist, create basic health from connection status
      try {
        const connResponse = await api.get(`/auth/oauth2/google-sheets/connections/${connectionId}`);
        const connection = connResponse.data;
        
        const basicHealth: ConnectionHealth = {
          status: getHealthFromConnectionStatus(connection.status),
          connectionStatus: connection.status,
          lastChecked: new Date().toISOString(),
          tokenExpiresAt: connection.tokenExpiresAt,
          tokenExpiresIn: connection.tokenExpiresAt 
            ? Math.max(0, Math.floor((new Date(connection.tokenExpiresAt).getTime() - Date.now()) / (1000 * 60)))
            : undefined,
          lastSuccessfulOperation: connection.lastSyncAt,
          errorCount: 0,
          uptime: connection.status === ConnectionStatus.ACTIVE ? 100 : 0,
          warnings: getWarningsFromConnection(connection),
        };
        
        setHealth(basicHealth);
      } catch (connError: any) {
        toast({
          title: 'Failed to Load Health Status',
          description: connError.message || 'Could not load connection health.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getHealthFromConnectionStatus = (status: ConnectionStatus): HealthStatus => {
    switch (status) {
      case ConnectionStatus.ACTIVE:
        return HealthStatus.HEALTHY;
      case ConnectionStatus.EXPIRED:
        return HealthStatus.WARNING;
      case ConnectionStatus.ERROR:
        return HealthStatus.CRITICAL;
      case ConnectionStatus.REVOKED:
        return HealthStatus.CRITICAL;
      default:
        return HealthStatus.UNKNOWN;
    }
  };

  const getWarningsFromConnection = (connection: any): string[] => {
    const warnings: string[] = [];
    
    if (connection.tokenExpiresAt) {
      const expiresIn = Math.floor((new Date(connection.tokenExpiresAt).getTime() - Date.now()) / (1000 * 60));
      if (expiresIn < 60) {
        warnings.push('Token expires in less than 1 hour');
      } else if (expiresIn < 24 * 60) {
        warnings.push('Token expires in less than 24 hours');
      }
    }
    
    if (connection.lastSyncAt) {
      const lastSync = new Date(connection.lastSyncAt);
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync > 24) {
        warnings.push('No successful operations in the last 24 hours');
      }
    }
    
    return warnings;
  };

  const getHealthIcon = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.HEALTHY:
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case HealthStatus.WARNING:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case HealthStatus.CRITICAL:
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getHealthColor = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.HEALTHY:
        return 'bg-green-100 text-green-800 border-green-200';
      case HealthStatus.WARNING:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case HealthStatus.CRITICAL:
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getHealthLabel = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.HEALTHY:
        return 'Healthy';
      case HealthStatus.WARNING:
        return 'Warning';
      case HealthStatus.CRITICAL:
        return 'Critical';
      default:
        return 'Unknown';
    }
  };

  const handleRefresh = () => {
    loadHealthStatus(true);
  };

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <LoadingSpinner className="h-4 w-4" />
        <span className="text-sm text-gray-600">Checking health...</span>
      </div>
    );
  }

  if (!health) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Clock className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-600">Health unknown</span>
      </div>
    );
  }

  const isTokenExpiringSoon = health.tokenExpiresIn !== undefined && health.tokenExpiresIn < 60;
  const hasWarnings = health.warnings.length > 0;

  return (
    <TooltipProvider>
      <div className={`space-y-2 ${className}`}>
        {/* Main Health Indicator */}
        <div className="flex items-center space-x-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className={`${getHealthColor(health.status)} flex items-center space-x-1 cursor-help`}
              >
                {getHealthIcon(health.status)}
                <span>{getHealthLabel(health.status)}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1 text-xs">
                <p>Connection Status: {health.connectionStatus}</p>
                <p>Last Checked: {formatDistanceToNow(new Date(health.lastChecked), { addSuffix: true })}</p>
                {health.uptime !== undefined && (
                  <p>Uptime: {health.uptime.toFixed(1)}%</p>
                )}
                {health.responseTime && (
                  <p>Response Time: {health.responseTime}ms</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Refresh Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-6 w-6 p-0"
          >
            {refreshing ? (
              <LoadingSpinner className="h-3 w-3" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Detailed Information */}
        {showDetails && (
          <div className="space-y-2">
            {/* Token Expiration Warning */}
            {isTokenExpiringSoon && (
              <div className="flex items-center space-x-2 text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                <Clock className="h-3 w-3" />
                <span>Token expires in {health.tokenExpiresIn} minutes</span>
              </div>
            )}

            {/* Connection Metrics */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {health.uptime !== undefined && (
                <div className="flex items-center space-x-1">
                  <Activity className="h-3 w-3 text-gray-500" />
                  <span>Uptime: {health.uptime.toFixed(1)}%</span>
                </div>
              )}

              {health.responseTime && (
                <div className="flex items-center space-x-1">
                  <Zap className="h-3 w-3 text-gray-500" />
                  <span>Response: {health.responseTime}ms</span>
                </div>
              )}

              {health.errorCount > 0 && (
                <div className="flex items-center space-x-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  <span>Errors: {health.errorCount}</span>
                </div>
              )}

              {health.lastSuccessfulOperation && (
                <div className="flex items-center space-x-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>
                    Last success: {formatDistanceToNow(new Date(health.lastSuccessfulOperation), { addSuffix: true })}
                  </span>
                </div>
              )}
            </div>

            {/* Quota Usage */}
            {health.quotaUsage && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span>API Quota</span>
                  <span>{health.quotaUsage.used}/{health.quotaUsage.limit}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div 
                    className="bg-blue-600 h-1 rounded-full" 
                    style={{ width: `${(health.quotaUsage.used / health.quotaUsage.limit) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  Resets {formatDistanceToNow(new Date(health.quotaUsage.resetAt), { addSuffix: true })}
                </p>
              </div>
            )}

            {/* Warnings */}
            {hasWarnings && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-700">Warnings:</p>
                {health.warnings.map((warning, index) => (
                  <div key={index} className="flex items-center space-x-2 text-xs text-yellow-700">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Last Error */}
            {health.lastError && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-700">Last Error:</p>
                <div className="flex items-start space-x-2 text-xs text-red-700 bg-red-50 p-2 rounded">
                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{health.lastError}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}