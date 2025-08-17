'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PlatformConnection, ConnectionStatus } from '@/types/auth';
import { AccountSelector } from './account-selector';
import { ErrorRecoveryDialog, ErrorType, ErrorDetails } from './error-recovery-dialog';
import { ConnectionHealthIndicator } from './connection-health-indicator';
import { 
  Settings, 
  Plus, 
  AlertTriangle,
  CheckCircle }
 from 'lucide-react';

interface EnhancedGoogleSheetsConnectionCardProps {
  connection: PlatformConnection;
  onConnectionUpdated: () => void;
  onConnectionDeleted: () => void;
}

interface GoogleAccount {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  status: ConnectionStatus;
  connectionId: string;
  connectedSpreadsheets: number;
  lastSyncAt?: string;
}

export function EnhancedGoogleSheetsConnectionCard({ 
  connection, 
  onConnectionUpdated, 
  onConnectionDeleted 
}: EnhancedGoogleSheetsConnectionCardProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(connection.id);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [currentError, setCurrentError] = useState<ErrorDetails | null>(null);

  // Mock error for demonstration
  const handleSimulateError = (errorType: ErrorType) => {
    const mockError: ErrorDetails = {
      type: errorType,
      message: getErrorMessage(errorType),
      connectionId: connection.id,
      timestamp: new Date().toISOString(),
      code: 'MOCK_ERROR_001',
    };
    
    setCurrentError(mockError);
    setShowErrorDialog(true);
  };

  const getErrorMessage = (type: ErrorType): string => {
    switch (type) {
      case ErrorType.TOKEN_EXPIRED:
        return 'Your Google Sheets access token has expired and needs to be refreshed.';
      case ErrorType.TOKEN_REVOKED:
        return 'Access to your Google account has been revoked. Please re-authenticate.';
      case ErrorType.INSUFFICIENT_PERMISSIONS:
        return 'The current permissions are not sufficient to access this spreadsheet.';
      case ErrorType.NETWORK_ERROR:
        return 'Unable to connect to Google Sheets API. Please check your internet connection.';
      default:
        return 'An unexpected error occurred while accessing Google Sheets.';
    }
  };

  const handleAccountSelected = (accountId: string, account: GoogleAccount) => {
    setSelectedAccountId(accountId);
    console.log('Selected account:', account);
    // Here you would typically update the context or perform account switching logic
  };

  const handleAddNewAccount = () => {
    console.log('Adding new Google account...');
    // Here you would typically initiate the OAuth flow for a new account
  };

  const handleErrorRecovered = () => {
    console.log('Error recovered, refreshing connection...');
    onConnectionUpdated();
  };

  const handleRetryOperation = async () => {
    // Simulate retry logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Retrying operation...');
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">📊</div>
              <div>
                <CardTitle className="text-lg">Enhanced Google Sheets</CardTitle>
                <CardDescription>
                  Multi-account Google Sheets integration with enhanced error handling
                </CardDescription>
              </div>
            </div>
            
            {/* Connection Health Indicator */}
            <ConnectionHealthIndicator 
              connectionId={connection.id}
              showDetails={true}
              className="flex-shrink-0"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Account Selector Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Google Account</h4>
              <Badge variant="outline" className="text-xs">
                Multi-Account Support
              </Badge>
            </div>
            
            <AccountSelector
              selectedAccountId={selectedAccountId}
              onAccountSelected={handleAccountSelected}
              onAddNewAccount={handleAddNewAccount}
              placeholder="Select Google account..."
            />
          </div>

          <Separator />

          {/* Connection Status and Actions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Connection Status</h4>
              <div className="flex items-center space-x-2">
                {connection.status === ConnectionStatus.ACTIVE ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
                <Badge 
                  variant={connection.status === ConnectionStatus.ACTIVE ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {connection.status}
                </Badge>
              </div>
            </div>

            {/* Demo Error Simulation Buttons */}
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Demo Error Recovery:</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSimulateError(ErrorType.TOKEN_EXPIRED)}
                  className="text-xs"
                >
                  Token Expired
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSimulateError(ErrorType.TOKEN_REVOKED)}
                  className="text-xs"
                >
                  Token Revoked
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSimulateError(ErrorType.INSUFFICIENT_PERMISSIONS)}
                  className="text-xs"
                >
                  Insufficient Permissions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSimulateError(ErrorType.NETWORK_ERROR)}
                  className="text-xs"
                >
                  Network Error
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Connection Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-600">Platform:</span>
              <p className="text-gray-800">{connection.platformName}</p>
            </div>
            
            <div>
              <span className="font-medium text-gray-600">Type:</span>
              <p className="text-gray-800">{connection.platformType}</p>
            </div>

            <div>
              <span className="font-medium text-gray-600">Scopes:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {connection.scopes.slice(0, 2).map((scope) => (
                  <Badge key={scope} variant="secondary" className="text-xs">
                    {scope.replace('https://www.googleapis.com/auth/', '')}
                  </Badge>
                ))}
                {connection.scopes.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{connection.scopes.length - 2} more
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <span className="font-medium text-gray-600">Created:</span>
              <p className="text-gray-800">
                {new Date(connection.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Spreadsheet
              </Button>
            </div>
            
            <Button 
              variant="destructive" 
              size="sm"
              onClick={onConnectionDeleted}
            >
              Revoke Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Recovery Dialog */}
      {showErrorDialog && currentError && (
        <ErrorRecoveryDialog
          isOpen={showErrorDialog}
          onClose={() => setShowErrorDialog(false)}
          error={currentError}
          onRetry={handleRetryOperation}
          onRecovered={handleErrorRecovered}
        />
      )}
    </>
  );
}