'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlatformConnection, ConnectionStatus, ConnectionTestResult } from '@/types/auth';
import { 
  RefreshCw, 
  TestTube, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  Unlink
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SpreadsheetSelector } from './spreadsheet-selector';

interface GoogleSheetsConnectionCardProps {
  connection: PlatformConnection;
  onConnectionUpdated: () => void;
  onConnectionDeleted: () => void;
}

interface ConnectedSpreadsheet {
  id: string;
  name: string;
  connectedAt?: string; // Make optional since it might be null/undefined
  webViewLink: string;
  sheets: SpreadsheetSheet[];
  hasError?: boolean;
  lastError?: string;
  syncCount?: number;
  lastSyncAt?: string;
}

interface SpreadsheetSheet {
  id: number;
  name: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export function GoogleSheetsConnectionCard({ 
  connection, 
  onConnectionUpdated, 
  onConnectionDeleted 
}: GoogleSheetsConnectionCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingSpreadsheet, setIsLoadingSpreadsheet] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showSpreadsheetSelector, setShowSpreadsheetSelector] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [connectedSpreadsheets, setConnectedSpreadsheets] = useState<ConnectedSpreadsheet[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadConnectedSpreadsheets();
  }, [connection.id]);

  const loadConnectedSpreadsheets = async () => {
    try {
      const response = await api.get(`/auth/oauth2/google-sheets/connections/${connection.id}/connected-spreadsheets`);
      setConnectedSpreadsheets(response.data.spreadsheets || []);
      

    } catch (error) {
      // Ignore error if no spreadsheets are connected
      setConnectedSpreadsheets([]);
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

  const handleRefreshConnection = async () => {
    setIsRefreshing(true);
    try {
      await api.refreshPlatformConnection(connection.id);
      toast({
        title: 'Connection Refreshed',
        description: 'The Google Sheets connection has been successfully refreshed.',
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
          description: 'The Google Sheets connection is working properly.',
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
        description: 'The Google Sheets connection has been successfully revoked.',
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

  const handleConnectSpreadsheet = async (spreadsheetId: string) => {
    setIsLoadingSpreadsheet(true);
    try {
      const result = await api.post(`/auth/oauth2/google-sheets/connections/${connection.id}/connect-spreadsheet`, {
        spreadsheetId,
      });
      
      toast({
        title: 'Spreadsheet Connected',
        description: `Successfully connected to "${result.data.spreadsheet?.properties?.title || 'spreadsheet'}".`,
      });
      
      await loadConnectedSpreadsheets();
      setShowSpreadsheetSelector(false);
      onConnectionUpdated();
    } catch (error: any) {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect to the spreadsheet.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpreadsheet(false);
    }
  };

  const handleDisconnectSpreadsheet = async (spreadsheetId: string) => {
    if (!confirm('Are you sure you want to disconnect from this spreadsheet?')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      // Use the new multi-spreadsheet disconnect endpoint
      await api.delete(`/auth/oauth2/google-sheets/connections/${connection.id}/spreadsheets/${spreadsheetId}/disconnect`);
      
      toast({
        title: 'Spreadsheet Disconnected',
        description: 'Successfully disconnected from the spreadsheet.',
      });
      
      // Reload the connected spreadsheets
      await loadConnectedSpreadsheets();
      onConnectionUpdated();
    } catch (error: any) {
      toast({
        title: 'Disconnection Failed',
        description: error.message || 'Failed to disconnect from the spreadsheet.',
        variant: 'destructive',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };



  const isTokenExpired = connection.tokenExpiresAt && 
    !isNaN(new Date(connection.tokenExpiresAt).getTime()) && 
    new Date(connection.tokenExpiresAt) < new Date();
  const canRefresh = connection.status === ConnectionStatus.ACTIVE || connection.status === ConnectionStatus.EXPIRED;
  const canTest = connection.status === ConnectionStatus.ACTIVE;
  const canConnectSpreadsheet = connection.status === ConnectionStatus.ACTIVE;

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📊</div>
              <div>
                <CardTitle className="text-lg">{connection.platformName}</CardTitle>
                <CardDescription className="flex items-center space-x-2">
                  <span>Google Sheets</span>
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
          {/* Connected Spreadsheets Section */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900 flex items-center space-x-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Connected Spreadsheets ({connectedSpreadsheets.length})</span>
              </h4>
              
              {canConnectSpreadsheet && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSpreadsheetSelector(true)}
                  disabled={isLoadingSpreadsheet}
                >
                  {isLoadingSpreadsheet ? (
                    <LoadingSpinner className="h-4 w-4" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-1" />
                      Connect
                    </>
                  )}
                </Button>
              )}
            </div>

            {connectedSpreadsheets.length > 0 ? (
              <div className="space-y-3">
                {connectedSpreadsheets.map((spreadsheet) => (
                  <div key={spreadsheet.id} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-900">{spreadsheet.name}</p>
                          {spreadsheet.hasError && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                              Error
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          Connected {spreadsheet.connectedAt && !isNaN(new Date(spreadsheet.connectedAt).getTime()) 
                            ? formatDistanceToNow(new Date(spreadsheet.connectedAt), { addSuffix: true })
                            : 'recently'
                          }
                          {spreadsheet.syncCount && spreadsheet.syncCount > 0 && (
                            <span className="ml-2">• {spreadsheet.syncCount} syncs</span>
                          )}
                        </p>
                        {spreadsheet.hasError && spreadsheet.lastError && (
                          <p className="text-xs text-red-600 mt-1">{spreadsheet.lastError}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(spreadsheet.webViewLink, '_blank')}
                          title="Open in Google Sheets"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnectSpreadsheet(spreadsheet.id)}
                          disabled={isDisconnecting}
                          className="text-red-600 hover:text-red-700"
                          title="Disconnect"
                        >
                          {isDisconnecting ? (
                            <LoadingSpinner className="h-4 w-4" />
                          ) : (
                            <Unlink className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {spreadsheet.sheets && spreadsheet.sheets.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Sheets ({spreadsheet.sheets.length}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {spreadsheet.sheets.map((sheet) => (
                            <Badge key={sheet.id} variant="secondary" className="text-xs">
                              {sheet.name} ({sheet.rowCount}×{sheet.columnCount})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <FileSpreadsheet className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No spreadsheets connected</p>
                {canConnectSpreadsheet && (
                  <p className="text-xs text-gray-500 mt-1">
                    Click &quot;Connect&quot; to select a spreadsheet
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Connection Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-600">Scopes:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {connection.scopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="text-xs">
                    {scope.replace('https://www.googleapis.com/auth/', '')}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <span className="font-medium text-gray-600">Created:</span>
              <p className="text-gray-800">
                {connection.createdAt && !isNaN(new Date(connection.createdAt).getTime())
                  ? formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true })
                  : 'Unknown'
                }
              </p>
            </div>

            {connection.lastSyncAt && (
              <div>
                <span className="font-medium text-gray-600">Last Sync:</span>
                <p className="text-gray-800">
                  {connection.lastSyncAt && !isNaN(new Date(connection.lastSyncAt).getTime())
                    ? formatDistanceToNow(new Date(connection.lastSyncAt), { addSuffix: true })
                    : 'Never'
                  }
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
                  {connection.tokenExpiresAt && !isNaN(new Date(connection.tokenExpiresAt).getTime())
                    ? formatDistanceToNow(new Date(connection.tokenExpiresAt), { addSuffix: true })
                    : 'Unknown'
                  }
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
                Tested {testResult.testedAt && !isNaN(new Date(testResult.testedAt).getTime())
                  ? formatDistanceToNow(new Date(testResult.testedAt), { addSuffix: true })
                  : 'recently'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Spreadsheet Selector Modal */}
      {showSpreadsheetSelector && (
        <SpreadsheetSelector
          connectionId={connection.id}
          onSpreadsheetSelected={handleConnectSpreadsheet}
          onClose={() => setShowSpreadsheetSelector(false)}
          isLoading={isLoadingSpreadsheet}
        />
      )}
    </>
  );
}