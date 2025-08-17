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
  Plus,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ExistingSpreadsheet {
  id: string;
  name: string;
  webViewLink: string;
  lastModified?: string;
  isOrderSyncEnabled: boolean;
}

interface ExistingSheetEnablerProps {
  connection: PlatformConnection;
  onSheetEnabled?: (sheetInfo: any) => void;
}

export function ExistingSheetEnabler({ 
  connection, 
  onSheetEnabled 
}: ExistingSheetEnablerProps) {
  const [spreadsheets, setSpreadsheets] = useState<ExistingSpreadsheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadExistingSpreadsheets();
  }, [connection.id]);

  const loadExistingSpreadsheets = async () => {
    setLoading(true);
    try {
      // Get connected spreadsheets
      const response = await api.get(
        `/auth/oauth2/google-sheets/connections/${connection.id}/connected-spreadsheets`
      );
      
      // Filter out sheets that are already enabled for order sync
      const availableSheets = response.data.spreadsheets?.filter(
        (sheet: any) => !sheet.isOrderSyncEnabled
      ) || [];
      
      setSpreadsheets(availableSheets);
    } catch (error: any) {
      toast({
        title: 'Failed to Load Spreadsheets',
        description: error.message || 'Could not load existing spreadsheets.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnableOrderSync = async (spreadsheetId: string, spreadsheetName: string) => {
    setEnabling(spreadsheetId);
    try {
      const response = await api.post(
        `/auth/oauth2/google-sheets/connections/${connection.id}/order-sync/enable`,
        {
          spreadsheetId,
          sheetName: 'Orders', // Default sheet name, can be configured later
          enableWebhook: true,
          config: {
            headerRow: 1,
            dataStartRow: 2,
            autoSync: true,
            duplicateHandling: 'skip',
            columnMapping: {
              // Default column mapping - can be configured later
              'A': 'orderDate',
              'B': 'customerName', 
              'C': 'phone',
              'D': 'address',
              'E': 'city',
              'F': 'product',
              'G': 'productSku',
              'H': 'quantity',
              'I': 'price'
            }
          }
        }
      );

      toast({
        title: 'Order Sync Enabled',
        description: `Successfully enabled order sync for "${spreadsheetName}".`,
      });

      onSheetEnabled?.(response.data);
      
      // Refresh the list
      await loadExistingSpreadsheets();
    } catch (error: any) {
      toast({
        title: 'Failed to Enable Order Sync',
        description: error.message || 'Could not enable order sync for this sheet.',
        variant: 'destructive',
      });
    } finally {
      setEnabling(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner className="h-6 w-6 mr-2" />
          <span>Loading existing spreadsheets...</span>
        </CardContent>
      </Card>
    );
  }

  if (spreadsheets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5" />
            <span>Enable Existing Sheets</span>
          </CardTitle>
          <CardDescription>
            No existing spreadsheets available to enable for order sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-4">
              All your connected spreadsheets are already enabled for order sync, 
              or you don&apos;t have any connected spreadsheets yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadExistingSpreadsheets}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <FileSpreadsheet className="h-5 w-5" />
              <span>Enable Existing Sheets</span>
            </CardTitle>
            <CardDescription>
              Enable order sync on your existing Google Sheets ({spreadsheets.length} available)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadExistingSpreadsheets}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {spreadsheets.map((sheet) => (
          <div 
            key={sheet.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-center space-x-3 flex-1">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="font-medium truncate">{sheet.name}</h4>
                  <Badge variant="outline" className="bg-gray-100 text-gray-800">
                    Not synced
                  </Badge>
                </div>
                
                {sheet.lastModified && (
                  <p className="text-xs text-muted-foreground">
                    Modified {formatDistanceToNow(new Date(sheet.lastModified), { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(sheet.webViewLink, '_blank')}
                title="Open in Google Sheets"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>

              <Button
                onClick={() => handleEnableOrderSync(sheet.id, sheet.name)}
                disabled={enabling === sheet.id}
                size="sm"
              >
                {enabling === sheet.id ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Enable Sync
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
        
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">What happens when you enable sync:</p>
              <ul className="text-xs space-y-1 ml-4 list-disc">
                <li>Webhook will be set up for real-time sync</li>
                <li>Default column mapping will be applied (can be configured later)</li>
                <li>Existing orders in the sheet will be imported</li>
                <li>New orders added to the sheet will sync automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}