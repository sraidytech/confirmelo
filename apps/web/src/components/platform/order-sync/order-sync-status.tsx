'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Zap,
  Calendar,
  Users,
  ShoppingCart
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SyncStatus {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  type: 'webhook' | 'manual' | 'scheduled';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  ordersProcessed: number;
  ordersCreated: number;
  ordersSkipped: number;
  errorCount: number;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  errors?: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}

interface SyncStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalOrdersProcessed: number;
  totalOrdersCreated: number;
  averageDuration: number;
  lastSyncAt?: string;
  nextScheduledSync?: string;
  webhookStatus: 'active' | 'inactive' | 'error';
}

interface OrderSyncStatusProps {
  connectionId: string;
  sheetId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function OrderSyncStatus({ 
  connectionId, 
  sheetId, 
  autoRefresh = true,
  refreshInterval = 30000 
}: OrderSyncStatusProps) {
  const [currentSync, setCurrentSync] = useState<SyncStatus | null>(null);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [recentSyncs, setRecentSyncs] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSyncStatus();
    
    if (autoRefresh) {
      const interval = setInterval(loadSyncStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [connectionId, sheetId, autoRefresh, refreshInterval]);

  const loadSyncStatus = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setRefreshing(true);
    
    try {
      const endpoint = sheetId 
        ? `/auth/oauth2/google-sheets/connections/${connectionId}/order-sync/status?sheetId=${sheetId}`
        : `/auth/oauth2/google-sheets/connections/${connectionId}/order-sync/status`;
        
      const response = await api.get(endpoint);
      
      setCurrentSync(response.data.currentSync);
      setStats(response.data.stats);
      setRecentSyncs(response.data.recentSyncs || []);
    } catch (error: any) {
      if (showLoading) {
        toast({
          title: 'Failed to Load Sync Status',
          description: error.message || 'Could not load sync status.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    loadSyncStatus(true);
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <LoadingSpinner className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getSyncTypeIcon = (type: string) => {
    switch (type) {
      case 'webhook':
        return <Zap className="h-4 w-4" />;
      case 'manual':
        return <RefreshCw className="h-4 w-4" />;
      case 'scheduled':
        return <Calendar className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner className="h-6 w-6 mr-2" />
          <span>Loading sync status...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Order Sync Status</h3>
          <p className="text-sm text-muted-foreground">
            Real-time sync monitoring and statistics
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoadingSpinner className="h-4 w-4 mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Current Sync Status */}
      {currentSync && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Current Sync</CardTitle>
              </div>
              
              <Badge 
                variant="outline" 
                className={`${getSyncStatusColor(currentSync.status)} flex items-center space-x-1`}
              >
                {getSyncStatusIcon(currentSync.status)}
                <span className="capitalize">{currentSync.status}</span>
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {currentSync.ordersProcessed}
                </div>
                <div className="text-sm text-muted-foreground">Processed</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {currentSync.ordersCreated}
                </div>
                <div className="text-sm text-muted-foreground">Created</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {currentSync.ordersSkipped}
                </div>
                <div className="text-sm text-muted-foreground">Skipped</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {currentSync.errorCount}
                </div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
            </div>

            {/* Progress Bar */}
            {currentSync.progress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{currentSync.progress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${currentSync.progress.percentage}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  {currentSync.progress.current} of {currentSync.progress.total} rows
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                {getSyncTypeIcon(currentSync.type)}
                <span className="capitalize">{currentSync.type} sync</span>
              </div>
              
              <div>
                Started {formatDistanceToNow(new Date(currentSync.startedAt), { addSuffix: true })}
                {currentSync.duration && (
                  <span className="ml-2">• {currentSync.duration}s</span>
                )}
              </div>
            </div>

            {/* Errors */}
            {currentSync.errors && currentSync.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-medium text-red-800 mb-2">Recent Errors</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {currentSync.errors.slice(0, 5).map((error, index) => (
                    <div key={index} className="text-sm text-red-700">
                      Row {error.row}: {error.field} - {error.message}
                    </div>
                  ))}
                  {currentSync.errors.length > 5 && (
                    <div className="text-sm text-red-600">
                      +{currentSync.errors.length - 5} more errors
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center space-x-2">
                <BarChart3 className="h-4 w-4" />
                <span>Total Syncs</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSyncs}</div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-green-600" />
                <span>{stats.successfulSyncs} successful</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center space-x-2">
                <ShoppingCart className="h-4 w-4" />
                <span>Orders Processed</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrdersProcessed}</div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3 text-blue-600" />
                <span>{stats.totalOrdersCreated} created</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>Average Duration</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageDuration}s</div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Activity className="h-3 w-3 text-purple-600" />
                <span>per sync</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Syncs */}
      {recentSyncs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Syncs</CardTitle>
            <CardDescription>
              Last {recentSyncs.length} sync operations
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              {recentSyncs.map((sync) => (
                <div key={sync.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      {getSyncTypeIcon(sync.type)}
                      <Badge 
                        variant="outline" 
                        className={`${getSyncStatusColor(sync.status)} flex items-center space-x-1`}
                      >
                        {getSyncStatusIcon(sync.status)}
                        <span className="text-xs capitalize">{sync.status}</span>
                      </Badge>
                    </div>
                    
                    <div>
                      <div className="text-sm font-medium">
                        {sync.ordersProcessed} orders processed
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(sync.startedAt), { addSuffix: true })}
                        {sync.duration && ` • ${sync.duration}s`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-sm">
                    <div className="text-green-600">{sync.ordersCreated} created</div>
                    {sync.errorCount > 0 && (
                      <div className="text-red-600">{sync.errorCount} errors</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Sync Info */}
      {stats?.nextScheduledSync && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                Next scheduled sync: {formatDistanceToNow(new Date(stats.nextScheduledSync), { addSuffix: true })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}