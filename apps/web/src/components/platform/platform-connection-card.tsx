'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlatformConnection, ConnectionStatus, PlatformType, ConnectionTestResult } from '@/types/auth';
import { 
  RefreshCw, 
  TestTube, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  ExternalLink,
  Settings
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PlatformConnectionCardProps {
  connection: PlatformConnection;
  onConnectionUpdated: () => void;
  onConnectionDeleted: () => void;
}

export function PlatformConnectionCard({ 
  connection, 
  onConnectionUpdated, 
  onConnectionDeleted 
}: PlatformConnectionCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const { toast } = useToast();

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.ACTIVE:
        return 'bg-green-100 text-green-800 border-green-200';
      case ConnectionStatus.EXPIRED:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case ConnectionStatus.REVOKED:
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case ConnectionStatus.ERROR:
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.ACTIVE:
        return <CheckCircle className="h-4 w-4" />;
      case ConnectionStatus.EXPIRED:
        return <Clock className="h-4 w-4" />;
      case ConnectionStatus.REVOKED:
        return <XCircle className="h-4 w-4" />;
      case ConnectionStatus.ERROR:
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getPlatformIcon = (platformType: PlatformType) => {
    switch (platformType) {
      case PlatformType.YOUCAN:
        return '🛒';
      case PlatformType.SHOPIFY:
        return '🛍️';
      case PlatformType.GOOGLE_SHEETS:
        return '📊';
      case PlatformType.MANUAL:
        return '✏️';
      default:
        return '🔗';
    }
  };

  const handleRefreshConnection = async () => {
    setIsRefreshing(true);
    try {
      await api.refreshPlatformConnection(connection.id);
      toast({
        title: 'Connection Refreshed',
        description: 'The platform connection has been successfully refreshed.',
      });
      onConnectionUpdated();
    } catch (error: any) {
      toast({
        title: 'Refresh Failed',
        description: error.message || 'Failed to refresh the connection.',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await api.testPlatformConnection(connection.id);
      setTestResult(result);
      
      if (result.success) {
        toast({
          title: 'Connection Test Successful',
          description: 'The platform connection is working properly.',
        });
      } else {
        toast({
          title: 'Connection Test Failed',
          description: result.error || 'The connection test failed.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      const failedResult: ConnectionTestResult = {
        success: false,
        error: error.message || 'Test failed',
        testedAt: new Date().toISOString(),
      };
      setTestResult(failedResult);
      
      toast({
        title: 'Connection Test Failed',
        description: error.message || 'Failed to test the connection.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeleteConnection = async () => {
    if (!confirm('Are you sure you want to revoke this connection? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await api.revokePlatformConnection(connection.id);
      toast({
        title: 'Connection Revoked',
        description: 'The platform connection has been successfully revoked.',
      });
      onConnectionDeleted();
    } catch (error: any) {
      toast({
        title: 'Revocation Failed',
        description: error.message || 'Failed to revoke the connection.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isTokenExpired = connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) < new Date();
  const canRefresh = connection.status === ConnectionStatus.ACTIVE || connection.status === ConnectionStatus.EXPIRED;
  const canTest = connection.status === ConnectionStatus.ACTIVE;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{getPlatformIcon(connection.platformType)}</div>
            <div>
              <CardTitle className="text-lg">{connection.platformName}</CardTitle>
              <CardDescription className="flex items-center space-x-2">
                <span>{connection.platformType}</span>
                <Badge 
                  variant="outline" 
                  className={`${getStatusColor(connection.status)} flex items-center space-x-1`}
                >
                  {getStatusIcon(connection.status)}
                  <span>{connection.status}</span>
                </Badge>
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              {canRefresh && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshConnection}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <LoadingSpinner className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh connection tokens</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {canTest && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                    >
                      {isTesting ? (
                        <LoadingSpinner className="h-4 w-4" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Test connection</p>
                  </TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteConnection}
                    disabled={isDeleting}
                    className="text-red-600 hover:text-red-700"
                  >
                    {isDeleting ? (
                      <LoadingSpinner className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Revoke connection</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Scopes:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {connection.scopes.map((scope) => (
                <Badge key={scope} variant="secondary" className="text-xs">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>
          
          <div>
            <span className="font-medium text-gray-600">Created:</span>
            <p className="text-gray-800">
              {formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true })}
            </p>
          </div>

          {connection.lastSyncAt && (
            <div>
              <span className="font-medium text-gray-600">Last Sync:</span>
              <p className="text-gray-800">
                {formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })}
              </p>
            </div>
          )}

          {connection.syncCount !== undefined && (
            <div>
              <span className="font-medium text-gray-600">Sync Count:</span>
              <p className="text-gray-800">{connection.syncCount}</p>
            </div>
          )}

          {connection.tokenExpiresAt && (
            <div>
              <span className="font-medium text-gray-600">Token Expires:</span>
              <p className={`${isTokenExpired ? 'text-red-600' : 'text-gray-800'}`}>
                {formatDistanceToNow(new Date(connection.tokenExpiresAt), { addSuffix: true })}
                {isTokenExpired && ' (Expired)'}
              </p>
            </div>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`p-3 rounded-lg border ${
            testResult.success 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center space-x-2">
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <span className={`font-medium ${
                testResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {testResult.success ? 'Connection Test Passed' : 'Connection Test Failed'}
              </span>
            </div>
            
            {testResult.error && (
              <p className="text-red-700 text-sm mt-1">{testResult.error}</p>
            )}
            
            {testResult.details && (
              <div className="mt-2 text-sm text-gray-600">
                <details>
                  <summary className="cursor-pointer hover:text-gray-800">
                    View test details
                  </summary>
                  <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                    {JSON.stringify(testResult.details, null, 2)}
                  </pre>
                </details>
              </div>
            )}
            
            <p className="text-xs text-gray-500 mt-2">
              Tested {formatDistanceToNow(new Date(testResult.testedAt), { addSuffix: true })}
            </p>
          </div>
        )}

        {/* Platform Data */}
        {connection.platformData && Object.keys(connection.platformData).length > 0 && (
          <div>
            <span className="font-medium text-gray-600 text-sm">Platform Data:</span>
            <details className="mt-1">
              <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                View platform-specific data
              </summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                {JSON.stringify(connection.platformData, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}