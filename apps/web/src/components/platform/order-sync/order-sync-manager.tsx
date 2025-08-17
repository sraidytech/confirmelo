'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PlatformConnection, PlatformType, ConnectionStatus } from '@/types/auth';
import { GoogleAccountConnection } from './google-account-connection';
import { OrderSheetCreation } from './order-sheet-creation';
import { OrderSheetList } from './order-sheet-list';
import { OrderSheetConfig } from './order-sheet-config';
import { OrderSyncStatus } from './order-sync-status';
import { ExistingSheetEnabler } from './existing-sheet-enabler';
import { SyncDiagnostic } from './sync-diagnostic';
import { 
  FileSpreadsheet,
  Plus,
  Settings,
  Activity,
  ArrowLeft,
  CheckCircle,
  Zap
} from 'lucide-react';

interface OrderSyncManagerProps {
  className?: string;
}

type ViewMode = 'overview' | 'create-sheet' | 'configure-sheet' | 'sheet-status' | 'diagnostics';

interface SelectedSheet {
  id: string;
  name: string;
  spreadsheetId: string;
}

export function OrderSyncManager({ className }: OrderSyncManagerProps) {
  const [selectedConnection, setSelectedConnection] = useState<PlatformConnection | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<SelectedSheet | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(false);
  const [componentId] = useState(() => Math.random().toString(36).substr(2, 9));
  const searchParams = useSearchParams();
  const { toast } = useToast();

  console.log(`OrderSyncManager[${componentId}]: Component rendered, selectedConnection:`, selectedConnection);

  // Component lifecycle debugging
  useEffect(() => {
    console.log(`OrderSyncManager[${componentId}]: Component mounted`);
    return () => {
      console.log(`OrderSyncManager[${componentId}]: Component unmounting`);
    };
  }, [componentId]);

  // Monitor selectedConnection changes
  useEffect(() => {
    console.log(`OrderSyncManager[${componentId}]: selectedConnection changed to:`, selectedConnection);
  }, [selectedConnection, componentId]);

  // Load connection from URL parameter
  useEffect(() => {
    const connectionId = searchParams.get('connection');
    console.log(`OrderSyncManager[${componentId}]: URL connectionId =`, connectionId);
    console.log(`OrderSyncManager[${componentId}]: selectedConnection =`, selectedConnection);
    if (connectionId && !selectedConnection) {
      console.log(`OrderSyncManager[${componentId}]: Loading connection...`);
      loadConnection(connectionId);
    }
  }, [searchParams, componentId]);

  const loadConnection = async (connectionId: string) => {
    setLoading(true);
    try {
      console.log('OrderSyncManager: Calling API for connection', connectionId);
      const connection = await api.getPlatformConnection(connectionId);
      console.log('OrderSyncManager: Received connection', connection);
      if (connection.platformType === PlatformType.GOOGLE_SHEETS) {
        setSelectedConnection(connection);
        console.log('OrderSyncManager: Connection set successfully');
      } else {
        console.log('OrderSyncManager: Invalid platform type', connection.platformType);
        toast({
          title: 'Invalid Connection',
          description: 'The selected connection is not a Google Sheets connection.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('OrderSyncManager: Failed to load connection', error);
      toast({
        title: 'Failed to Load Connection',
        description: error.message || 'Could not load the connection.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectionSelected = (connection: PlatformConnection) => {
    console.log(`OrderSyncManager[${componentId}]: handleConnectionSelected called with:`, connection);
    console.log(`OrderSyncManager[${componentId}]: connection.id:`, connection?.id);
    console.log(`OrderSyncManager[${componentId}]: connection.status:`, connection?.status);
    console.log(`OrderSyncManager[${componentId}]: connection.platformType:`, connection?.platformType);
    
    // Create a stable copy of the connection
    const stableConnection = { ...connection };
    
    setSelectedConnection(stableConnection);
    setSelectedSheet(null);
    setViewMode('overview');
    
    // Force a re-render check
    setTimeout(() => {
      console.log(`OrderSyncManager[${componentId}]: After state update, selectedConnection should be:`, stableConnection?.platformName);
    }, 100);
  };

  const handleCreateSheet = () => {
    if (!selectedConnection) {
      toast({
        title: 'No Connection Selected',
        description: 'Please select a Google account connection first.',
        variant: 'destructive',
      });
      return;
    }
    setViewMode('create-sheet');
  };

  const handleSheetCreated = (sheetInfo: any) => {
    toast({
      title: 'Sheet Created Successfully',
      description: `Order sheet "${sheetInfo.name}" has been created and configured.`,
    });
    setRefreshTrigger(prev => prev + 1);
    setViewMode('overview');
  };

  const handleSheetSelected = (sheet: any) => {
    setSelectedSheet({
      id: sheet.id,
      name: sheet.name,
      spreadsheetId: sheet.spreadsheetId
    });
    setViewMode('sheet-status');
  };

  const handleConfigureSheet = (sheet: any) => {
    setSelectedSheet({
      id: sheet.id,
      name: sheet.name,
      spreadsheetId: sheet.spreadsheetId
    });
    setViewMode('configure-sheet');
  };

  const handleConfigUpdated = () => {
    toast({
      title: 'Configuration Updated',
      description: 'Order sheet configuration has been saved successfully.',
    });
    setRefreshTrigger(prev => prev + 1);
    setViewMode('overview');
  };

  const handleBackToOverview = () => {
    setSelectedSheet(null);
    setViewMode('overview');
  };

  const renderBreadcrumb = () => {
    const items = ['Order Sync'];
    
    if (selectedConnection) {
      items.push(selectedConnection.platformName);
    }
    
    if (selectedSheet) {
      items.push(selectedSheet.name);
    }
    
    if (viewMode === 'create-sheet') {
      items.push('Create Sheet');
    } else if (viewMode === 'configure-sheet') {
      items.push('Configure');
    } else if (viewMode === 'sheet-status') {
      items.push('Status');
    } else if (viewMode === 'diagnostics') {
      items.push('Diagnostics');
    }

    return (
      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-4">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span>/</span>}
            <span className={index === items.length - 1 ? 'text-foreground font-medium' : ''}>
              {item}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'create-sheet':
        if (!selectedConnection) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToOverview}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
            
            <OrderSheetCreation
              connection={selectedConnection}
              onSheetCreated={handleSheetCreated}
              onCancel={handleBackToOverview}
            />
          </div>
        );

      case 'configure-sheet':
        if (!selectedConnection || !selectedSheet) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToOverview}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
            
            <OrderSheetConfig
              connectionId={selectedConnection.id}
              sheetId={selectedSheet.id}
              onConfigUpdated={handleConfigUpdated}
              onCancel={handleBackToOverview}
            />
          </div>
        );

      case 'sheet-status':
        if (!selectedConnection || !selectedSheet) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToOverview}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('configure-sheet')}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configure
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('diagnostics')}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Diagnostics
                </Button>
              </div>
            </div>
            
            <OrderSyncStatus
              connectionId={selectedConnection.id}
              sheetId={selectedSheet.id}
              autoRefresh={true}
            />
          </div>
        );

      case 'diagnostics':
        if (!selectedConnection) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToOverview}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
            
            <SyncDiagnostic
              connectionId={selectedConnection.id}
              spreadsheetId={selectedSheet?.spreadsheetId}
            />
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            {/* Google Account Connection */}
            <GoogleAccountConnection
              onConnectionSelected={handleConnectionSelected}
              selectedConnectionId={selectedConnection?.id}
              showCreateNew={true}
            />

            {/* Debug Info */}
            {selectedConnection && (
              <div className="p-4 bg-yellow-100 border-2 border-yellow-500 rounded-lg text-sm mb-4">
                <h4 className="font-bold text-yellow-800 mb-2">🟡 CONNECTION SELECTED DEBUG</h4>
                <p><strong>Debug:</strong> Connection selected: {selectedConnection.platformName}</p>
                <p><strong>Status:</strong> {selectedConnection.status}</p>
                <p><strong>ConnectionStatus.ACTIVE:</strong> {ConnectionStatus.ACTIVE}</p>
                <p><strong>Status Match:</strong> {selectedConnection.status === ConnectionStatus.ACTIVE ? 'Yes' : 'No'}</p>
                <p><strong>Should show Order Sheets:</strong> {selectedConnection.status === ConnectionStatus.ACTIVE ? 'Yes' : 'No'}</p>
              </div>
            )}

            {/* Always show this for debugging */}
            <div className="p-4 bg-red-100 border-2 border-red-500 rounded-lg text-sm mb-4">
              <h4 className="font-bold text-red-800 mb-2">🔴 ALWAYS VISIBLE DEBUG</h4>
              <p><strong>selectedConnection:</strong> {selectedConnection ? 'EXISTS' : 'NULL'}</p>
              <p><strong>URL params:</strong> {searchParams.get('connection')}</p>
              <p><strong>loading:</strong> {loading ? 'YES' : 'NO'}</p>
              <p><strong>viewMode:</strong> {viewMode}</p>
              <p><strong>componentId:</strong> {componentId}</p>
            </div>

            {/* Order Sheets Management */}
            {selectedConnection && selectedConnection.status === ConnectionStatus.ACTIVE && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Order Sheets</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage Google Sheets configured for order sync
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={handleCreateSheet}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Order Sheet
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setViewMode('diagnostics')}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Diagnostics
                    </Button>
                  </div>
                </div>

                <OrderSheetList
                  connection={selectedConnection}
                  onSheetSelected={handleSheetSelected}
                  onConfigureSheet={handleConfigureSheet}
                  refreshTrigger={refreshTrigger}
                />
                
                <ExistingSheetEnabler
                  connection={selectedConnection}
                  onSheetEnabled={handleSheetCreated}
                />
              </div>
            )}

            {/* Connection Status Warning */}
            {selectedConnection && selectedConnection.status !== ConnectionStatus.ACTIVE && (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h3 className="text-lg font-semibold mb-2">Connection Not Active</h3>
                    <p className="text-gray-600 mb-4">
                      The selected Google account connection is not active. 
                      Please refresh or reconnect to enable order sync.
                    </p>
                    <div className="text-sm text-muted-foreground">
                      Status: <span className="font-medium">{selectedConnection.status}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
    }
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Order Sync Management</h2>
            <p className="text-muted-foreground">
              Configure and manage order synchronization with Google Sheets.
            </p>
          </div>
        </div>

        {/* ALWAYS VISIBLE TEST */}
        <div className="p-4 bg-purple-100 border-2 border-purple-500 rounded-lg mb-4">
          <h3 className="font-bold text-purple-800">🔧 COMPONENT TEST [{componentId}]</h3>
          <p className="text-purple-700">If you can see this purple box, the OrderSyncManager component is working!</p>
          <p className="text-sm text-purple-600">Selected Connection: {selectedConnection ? selectedConnection.platformName : 'NONE'}</p>
          <p className="text-xs text-purple-500">Component renders: {Date.now()}</p>
        </div>

        {/* Breadcrumb */}
        {renderBreadcrumb()}

        {/* Main Content */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner className="h-8 w-8 mr-2" />
              <span>Loading connection...</span>
            </div>
          ) : (
            renderContent()
          )}
        </div>

        {/* Help Section */}
        {viewMode === 'overview' && !selectedConnection && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center space-x-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                <span>Getting Started</span>
              </CardTitle>
              <CardDescription>
                Follow these steps to set up order sync with Google Sheets
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium">Connect Google Account</h4>
                    <p className="text-sm text-muted-foreground">
                      Connect your Google account to access Google Sheets
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium">Create Order Sheet</h4>
                    <p className="text-sm text-muted-foreground">
                      Create a new Google Sheet configured for order data
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium">Configure Sync Settings</h4>
                    <p className="text-sm text-muted-foreground">
                      Map columns and set up validation rules
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-sm font-medium">
                    <CheckCircle className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="font-medium">Start Syncing Orders</h4>
                    <p className="text-sm text-muted-foreground">
                      Orders will automatically sync from your Google Sheet
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}