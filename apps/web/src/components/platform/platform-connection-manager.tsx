'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { 
  PlatformConnection, 
  PlatformConnectionsResponse, 
  PlatformType, 
  ConnectionStatus,
  InitiatePlatformConnectionDto,
  PlatformConnectionAuthResponse
} from '@/types/auth';
import { PlatformConnectionCard } from './platform-connection-card';
import { GoogleSheetsConnectionCard } from './google-sheets-connection-card';
import { AddPlatformConnectionDialog } from './add-platform-connection-dialog';
import { Plus, RefreshCw, Filter } from 'lucide-react';

interface PlatformConnectionManagerProps {
  className?: string;
}

export function PlatformConnectionManager({ className }: PlatformConnectionManagerProps) {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ConnectionStatus | 'ALL'>('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'ALL'>('ALL');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const { toast } = useToast();

  const loadConnections = async (page = 1, showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params: any = {
        page,
        limit: pagination.limit,
      };

      if (selectedStatus !== 'ALL') {
        params.status = selectedStatus;
      }

      if (selectedPlatform !== 'ALL') {
        params.platformType = selectedPlatform;
      }

      const response: PlatformConnectionsResponse = await api.getPlatformConnections(params);
      
      setConnections(response.connections);
      setPagination({
        page: response.page,
        limit: response.limit,
        total: response.total,
        totalPages: response.totalPages,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to Load Connections',
        description: error.message || 'Could not load platform connections.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshConnections = async () => {
    setRefreshing(true);
    await loadConnections(pagination.page, false);
    setRefreshing(false);
    toast({
      title: 'Connections Refreshed',
      description: 'Platform connections have been refreshed.',
    });
  };

  const handleConnectionUpdated = () => {
    loadConnections(pagination.page, false);
  };

  const handleConnectionDeleted = () => {
    loadConnections(pagination.page, false);
  };

  const handleAddConnection = async (data: InitiatePlatformConnectionDto) => {
    try {
      const response: PlatformConnectionAuthResponse = await api.initiatePlatformConnection(data);
      
      // Redirect to OAuth2 authorization URL
      window.location.href = response.authorizationUrl;
    } catch (error: any) {
      toast({
        title: 'Failed to Initiate Connection',
        description: error.message || 'Could not start the connection process.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadConnections();
  }, [selectedStatus, selectedPlatform]);

  const getStatusCounts = () => {
    const counts = {
      [ConnectionStatus.ACTIVE]: 0,
      [ConnectionStatus.EXPIRED]: 0,
      [ConnectionStatus.REVOKED]: 0,
      [ConnectionStatus.ERROR]: 0,
    };

    connections.forEach(conn => {
      counts[conn.status]++;
    });

    return counts;
  };

  const getPlatformCounts = () => {
    const counts = {
      [PlatformType.YOUCAN]: 0,
      [PlatformType.SHOPIFY]: 0,
      [PlatformType.GOOGLE_SHEETS]: 0,
      [PlatformType.MANUAL]: 0,
    };

    connections.forEach(conn => {
      counts[conn.platformType]++;
    });

    return counts;
  };

  const statusCounts = getStatusCounts();
  const platformCounts = getPlatformCounts();

  const filteredConnections = connections.filter(conn => {
    const statusMatch = selectedStatus === 'ALL' || conn.status === selectedStatus;
    const platformMatch = selectedPlatform === 'ALL' || conn.platformType === selectedPlatform;
    return statusMatch && platformMatch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner className="h-8 w-8" />
        <span className="ml-2">Loading platform connections...</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Platform Connections</h2>
            <p className="text-muted-foreground">
              Manage your integrations with e-commerce platforms and data sources.
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={handleRefreshConnections}
              disabled={refreshing}
            >
              {refreshing ? (
                <LoadingSpinner className="h-4 w-4 mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
            
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Connection
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pagination.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statusCounts[ConnectionStatus.ACTIVE]}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {statusCounts[ConnectionStatus.EXPIRED]}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {statusCounts[ConnectionStatus.ERROR]}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Tabs defaultValue="all" className="w-full">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-full max-w-md grid-cols-5">
              <TabsTrigger 
                value="all" 
                onClick={() => setSelectedStatus('ALL')}
                className="text-xs"
              >
                All
              </TabsTrigger>
              <TabsTrigger 
                value="active" 
                onClick={() => setSelectedStatus(ConnectionStatus.ACTIVE)}
                className="text-xs"
              >
                Active
              </TabsTrigger>
              <TabsTrigger 
                value="expired" 
                onClick={() => setSelectedStatus(ConnectionStatus.EXPIRED)}
                className="text-xs"
              >
                Expired
              </TabsTrigger>
              <TabsTrigger 
                value="error" 
                onClick={() => setSelectedStatus(ConnectionStatus.ERROR)}
                className="text-xs"
              >
                Error
              </TabsTrigger>
              <TabsTrigger 
                value="revoked" 
                onClick={() => setSelectedStatus(ConnectionStatus.REVOKED)}
                className="text-xs"
              >
                Revoked
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value as PlatformType | 'ALL')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Platforms</option>
                <option value={PlatformType.YOUCAN}>Youcan</option>
                <option value={PlatformType.SHOPIFY}>Shopify</option>
                <option value={PlatformType.GOOGLE_SHEETS}>Google Sheets</option>
                <option value={PlatformType.MANUAL}>Manual</option>
              </select>
            </div>
          </div>

          <TabsContent value="all" className="mt-6">
            {/* Connections List */}
            {filteredConnections.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="text-4xl mb-4">🔗</div>
                  <h3 className="text-lg font-semibold mb-2">No Platform Connections</h3>
                  <p className="text-gray-600 text-center mb-4">
                    Connect your e-commerce platforms and data sources to start managing orders.
                  </p>
                  <Button onClick={() => setShowAddDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Connection
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredConnections.map((connection) => {
                  // Use Google Sheets specific card for Google Sheets connections
                  if (connection.platformType === PlatformType.GOOGLE_SHEETS) {
                    return (
                      <GoogleSheetsConnectionCard
                        key={connection.id}
                        connection={connection}
                        onConnectionUpdated={handleConnectionUpdated}
                        onConnectionDeleted={handleConnectionDeleted}
                      />
                    );
                  }
                  
                  // Use generic card for other platforms
                  return (
                    <PlatformConnectionCard
                      key={connection.id}
                      connection={connection}
                      onConnectionUpdated={handleConnectionUpdated}
                      onConnectionDeleted={handleConnectionDeleted}
                    />
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-gray-600">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} connections
                </p>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadConnections(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    Previous
                  </Button>
                  
                  <span className="text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadConnections(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Connection Dialog */}
      <AddPlatformConnectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddConnection={handleAddConnection}
      />
    </div>
  );
}