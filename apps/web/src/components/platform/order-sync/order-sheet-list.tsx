'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlatformConnection } from '@/types/auth';
import { 
  FileSpreadsheet,
  ExternalLink,
  Settings,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Zap,
  ZapOff
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface OrderSheet {
  spreadsheetId: string;
  spreadsheetName: string;
  webViewLink: string;
  isOrderSyncEnabled: boolean;
  lastSyncAt?: string;
  totalOrders: number;
  config: {
    webhookEnabled: boolean;
    columnMapping: Record<string, string>;
  };
  // Legacy fields for compatibility
  id?: string;
  name?: string;
  syncEnabled?: boolean;
  syncStatus?: 'active' | 'paused' | 'error' | 'never_synced';
  nextSyncAt?: string;
  pendingOrders?: number;
  errorCount?: number;
  createdAt?: string;
}

interface OrderSheetListProps {
  connection: PlatformConnection;
  onSheetSelected?: (sheet: OrderSheet) => void;
  onConfigureSheet?: (sheet: OrderSheet) => void;
  refreshTrigger?: number;
}

export function OrderSheetList({ 
  connection, 
  onSheetSelected, 
  onConfigureSheet,
  refreshTrigger 
}: OrderSheetListProps) {
  const [sheets, setSheets] = useState<OrderSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadOrderSheets();
  }, [connection.id, refreshTrigger]);

  const loadOrderSheets = async () => {
    setLoading(true);
    try {
      const response = await api.get(
        `/auth/oauth2/google-sheets/connections/${connection.id}/order-sheets`
      );
      setSheets(response.data.orderSheets || []);
    } catch (error: any) {
      toast({
        title: 'Failed to Load Order Sheets',
        description: error.message || 'Could not load order sheets.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSync = async (sheetId: string, enable: boolean) => {
    setActionLoading(sheetId);
    try {
      const endpoint = enable ? 'enable' : 'disable';
      await api.post(
        `/auth/oauth2/google-sheets/connections/${connection.id}/order-sync/${endpoint}`,
        { sheetId }
      );

      toast({
        title: `Sync ${enable ? 'Enabled' : 'Disabled'}`,
        description: `Order sync has been ${enable ? 'enabled' : 'disabled'} for this sheet.`,
      });

      await loadOrderSheets();
    } catch (error: any) {
      toast({
        title: `Failed to ${enable ? 'Enable' : 'Disable'} Sync`,
        description: error.message || 'Could not update sync status.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualSync = async (spreadsheetId: string) => {
    setActionLoading(spreadsheetId);
    try {
      // CRITICAL FIX: Use correct API method with proper parameters
      const result = await api.triggerManualSync(connection.id, spreadsheetId);

      toast({
        title: 'Manual Sync Started',
        description: `Order sync has been triggered manually. Operation ID: ${result.operationId}`,
      });

      // Refresh after a short delay to show updated status
      setTimeout(() => {
        loadOrderSheets();
      }, 2000);
    } catch (error: any) {
      console.error('Manual sync failed:', error);
      toast({
        title: 'Manual Sync Failed',
        description: error.message || 'Could not trigger manual sync.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAutoSync = async (spreadsheetId: string, enable: boolean) => {
    setActionLoading(spreadsheetId);
    try {
      if (enable) {
        await api.post(`/auth/oauth2/google-sheets/connections/${connection.id}/spreadsheets/${spreadsheetId}/auto-sync`);
        toast({
          title: 'Auto-Sync Enabled',
          description: 'Orders will now sync automatically when the sheet is updated.',
        });
      } else {
        await api.delete(`/auth/oauth2/google-sheets/connections/${connection.id}/spreadsheets/${spreadsheetId}/auto-sync`);
        toast({
          title: 'Auto-Sync Disabled',
          description: 'Automatic sync has been disabled. You can still sync manually.',
        });
      }

      // Refresh to show updated webhook status
      await loadOrderSheets();
    } catch (error: any) {
      toast({
        title: `Failed to ${enable ? 'Enable' : 'Disable'} Auto-Sync`,
        description: error.message || 'Could not update auto-sync settings.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSheet = async (sheetId: string, sheetName: string) => {
    if (!confirm(`Are you sure you want to remove "${sheetName}" from order sync? This will not delete the Google Sheet itself.`)) {
      return;
    }

    setActionLoading(sheetId);
    try {
      await api.delete(
        `/auth/oauth2/google-sheets/order-sheets/${sheetId}`
      );

      toast({
        title: 'Sheet Removed',
        description: 'The sheet has been removed from order sync.',
      });

      await loadOrderSheets();
    } catch (error: any) {
      toast({
        title: 'Failed to Remove Sheet',
        description: error.message || 'Could not remove the sheet.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'never_synced':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4" />;
      case 'paused':
        return <Pause className="h-4 w-4" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4" />;
      case 'never_synced':
        return <Clock className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner className="h-6 w-6 mr-2" />
          <span>Loading order sheets...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Order Sheets</h3>
          <p className="text-sm text-muted-foreground">
            Google Sheets configured for order sync ({sheets.length})
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={loadOrderSheets}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {sheets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileSpreadsheet className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Order Sheets</h3>
            <p className="text-gray-600 text-center mb-4">
              Create your first order sheet to start syncing orders from Google Sheets.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sheets.map((sheet) => (
            <Card 
              key={sheet.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSheetSelected?.(sheet)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <FileSpreadsheet className="h-5 w-5 text-blue-600 mt-1" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium truncate">{sheet.spreadsheetName}</h4>
                        <Badge 
                          variant="outline" 
                          className={`${getSyncStatusColor(sheet.isOrderSyncEnabled ? 'active' : 'paused')} flex items-center space-x-1`}
                        >
                          {getSyncStatusIcon(sheet.isOrderSyncEnabled ? 'active' : 'paused')}
                          <span className="text-xs capitalize">{sheet.isOrderSyncEnabled ? 'Active' : 'Paused'}</span>
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-2">
                        <span className="flex items-center space-x-1">
                          <BarChart3 className="h-3 w-3" />
                          <span>{sheet.totalOrders} orders</span>
                        </span>
                        
                        {(sheet.pendingOrders || 0) > 0 && (
                          <span className="text-yellow-600">
                            {sheet.pendingOrders} pending
                          </span>
                        )}
                        
                        {(sheet.errorCount || 0) > 0 && (
                          <span className="text-red-600">
                            {sheet.errorCount} errors
                          </span>
                        )}
                      </div>

                      {/* Sync Info */}
                      <div className="text-xs text-muted-foreground space-y-1">
                        {sheet.createdAt && (
                          <p>
                            Created {formatDistanceToNow(new Date(sheet.createdAt), { addSuffix: true })}
                          </p>
                        )}
                        
                        {sheet.lastSyncAt && (
                          <p>
                            Last sync {formatDistanceToNow(new Date(sheet.lastSyncAt), { addSuffix: true })}
                          </p>
                        )}
                        
                        {sheet.nextSyncAt && sheet.isOrderSyncEnabled && (
                          <p>
                            Next sync {formatDistanceToNow(new Date(sheet.nextSyncAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(sheet.webViewLink, '_blank');
                      }}
                      title="Open in Google Sheets"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleManualSync(sheet.spreadsheetId);
                      }}
                      disabled={actionLoading === sheet.spreadsheetId}
                      title="Manual sync"
                    >
                      {actionLoading === sheet.spreadsheetId ? (
                        <LoadingSpinner className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAutoSync(sheet.spreadsheetId, !sheet.config?.webhookEnabled);
                      }}
                      disabled={actionLoading === sheet.spreadsheetId}
                      title={sheet.config?.webhookEnabled ? 'Disable auto-sync' : 'Enable auto-sync'}
                      className={sheet.config?.webhookEnabled ? 'text-green-600 hover:text-green-700' : 'text-gray-600 hover:text-gray-700'}
                    >
                      {sheet.config?.webhookEnabled ? (
                        <Zap className="h-4 w-4" />
                      ) : (
                        <ZapOff className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSync(sheet.spreadsheetId, !sheet.isOrderSyncEnabled);
                      }}
                      disabled={actionLoading === sheet.spreadsheetId}
                      title={sheet.isOrderSyncEnabled ? 'Disable sync' : 'Enable sync'}
                    >
                      {sheet.isOrderSyncEnabled ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigureSheet?.(sheet);
                      }}
                      title="Configure"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSheet(sheet.spreadsheetId, sheet.spreadsheetName);
                      }}
                      disabled={actionLoading === sheet.spreadsheetId}
                      className="text-red-600 hover:text-red-700"
                      title="Remove from sync"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Configuration Info */}
                {sheet.config && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      {sheet.config.webhookEnabled ? (
                        <span className="flex items-center space-x-1 text-green-600">
                          <Zap className="h-3 w-3" />
                          <span>Auto-sync enabled</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-gray-500">
                          <ZapOff className="h-3 w-3" />
                          <span>Manual sync only</span>
                        </span>
                      )}
                      
                      {sheet.config?.columnMapping && (
                        <span>
                          {Object.keys(sheet.config.columnMapping).length} columns mapped
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}