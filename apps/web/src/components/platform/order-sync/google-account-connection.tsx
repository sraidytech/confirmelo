'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  PlatformConnection, 
  ConnectionStatus, 
  PlatformType 
} from '@/types/auth';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  Plus,
  RefreshCw,
  TestTube,
  Settings
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface GoogleAccountConnectionProps {
  onConnectionSelected?: (connection: PlatformConnection) => void;
  selectedConnectionId?: string;
  showCreateNew?: boolean;
}

export function GoogleAccountConnection({ 
  onConnectionSelected, 
  selectedConnectionId,
  showCreateNew = true 
}: GoogleAccountConnectionProps) {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadGoogleConnections();
  }, []);

  const loadGoogleConnections = async () => {
    setLoading(true);
    try {
      const response = await api.getPlatformConnections({
        platformType: PlatformType.GOOGLE_SHEETS,
        limit: 50
      });
      setConnections(response.connections);
    } catch (error: any) {
      toast({
        title: 'Failed to Load Connections',
        description: error.message || 'Could not load Google account connections.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConnection = async () => {
    try {
      const response = await api.initiatePlatformConnection({
        platformType: PlatformType.GOOGLE_SHEETS,
        platformName: 'Google Sheets',
        platformData: {
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file'
          ]
        }
      });
      
      // Redirect to OAuth2 authorization URL
      window.location.href = response.authorizationUrl;
    } catch (error: any) {
      toast({
        title: 'Failed to Create Connection',
        description: error.message || 'Could not start the connection process.',
        variant: 'destructive',
      });
    }
  };

  const handleTestConnection = async (connectionId: string) => {
    setTesting(connectionId);
    try {
      const result = await api.testPlatformConnection(connectionId);
      
      if (result.success) {
        toast({
          title: 'Connection Test Successful',
          description: 'The Google account connection is working properly.',
        });
      } else {
        toast({
          title: 'Connection Test Failed',
          description: result.error || 'The connection test failed.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Connection Test Failed',
        description: error.message || 'Failed to test the connection.',
        variant: 'destructive',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleRefreshConnection = async (connectionId: string) => {
    setRefreshing(connectionId);
    try {
      await api.refreshPlatformConnection(connectionId);
      toast({
        title: 'Connection Refreshed',
        description: 'The Google account connection has been refreshed.',
      });
      await loadGoogleConnections();
    } catch (error: any) {
      toast({
        title: 'Refresh Failed',
        description: error.message || 'Failed to refresh the connection.',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(null);
    }
  };

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

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner className="h-6 w-6 mr-2" />
          <span>Loading Google account connections...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Google Account Connections</h3>
          <p className="text-sm text-muted-foreground">
            Select a Google account to use for order sync
          </p>
        </div>
        
        {showCreateNew && (
          <Button onClick={handleCreateConnection} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        )}
      </div>

      {connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-4xl mb-4">🔗</div>
            <h3 className="text-lg font-semibold mb-2">No Google Accounts Connected</h3>
            <p className="text-gray-600 text-center mb-4">
              Connect your Google account to enable order sync with Google Sheets.
            </p>
            {showCreateNew && (
              <Button onClick={handleCreateConnection}>
                <Plus className="h-4 w-4 mr-2" />
                Connect Google Account
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {connections.map((connection) => {
            const isSelected = selectedConnectionId === connection.id;
            const isTokenExpired = connection.tokenExpiresAt && 
              new Date(connection.tokenExpiresAt) < new Date();
            
            return (
              <Card 
                key={connection.id} 
                className={`cursor-pointer transition-all ${
                  isSelected 
                    ? 'ring-2 ring-blue-500 border-blue-200' 
                    : 'hover:border-gray-300'
                }`}
                onClick={() => {
                  console.log('GoogleAccountConnection: Card clicked, connection:', connection);
                  console.log('GoogleAccountConnection: onConnectionSelected exists:', !!onConnectionSelected);
                  onConnectionSelected?.(connection);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl">📧</div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{connection.platformName}</h4>
                          <Badge 
                            variant="outline" 
                            className={`${getStatusColor(connection.status)} flex items-center space-x-1`}
                          >
                            {getStatusIcon(connection.status)}
                            <span className="text-xs">{connection.status}</span>
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            Connected {formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true })}
                          </p>
                          
                          {connection.tokenExpiresAt && (
                            <p className={isTokenExpired ? 'text-red-600' : ''}>
                              Token expires {formatDistanceToNow(new Date(connection.tokenExpiresAt), { addSuffix: true })}
                              {isTokenExpired && ' (Expired)'}
                            </p>
                          )}
                          
                          {connection.lastSyncAt && (
                            <p>
                              Last sync {formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {connection.status === ConnectionStatus.ACTIVE && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestConnection(connection.id);
                          }}
                          disabled={testing === connection.id}
                        >
                          {testing === connection.id ? (
                            <LoadingSpinner className="h-4 w-4" />
                          ) : (
                            <TestTube className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {(connection.status === ConnectionStatus.ACTIVE || 
                        connection.status === ConnectionStatus.EXPIRED) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefreshConnection(connection.id);
                          }}
                          disabled={refreshing === connection.id}
                        >
                          {refreshing === connection.id ? (
                            <LoadingSpinner className="h-4 w-4" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {isSelected && (
                        <div className="text-blue-600">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Scopes */}
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex flex-wrap gap-1">
                      {connection.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-xs">
                          {scope.replace('https://www.googleapis.com/auth/', '')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}