# Google Sheets Multi-Connection Integration Guide

This guide shows how to integrate the new Google Sheets multi-connection components into your existing application.

## Quick Start

### 1. Basic Account Selection

```tsx
import { AccountSelector } from '@/components/platform/account-selector';
import { useState } from 'react';

function MyComponent() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>();

  return (
    <AccountSelector
      selectedAccountId={selectedAccountId}
      onAccountSelected={(accountId, account) => {
        setSelectedAccountId(accountId);
        console.log('Selected account:', account.email);
      }}
      onAddNewAccount={() => {
        // Redirect to OAuth flow
        window.location.href = '/auth/google-sheets/connect';
      }}
    />
  );
}
```

### 2. Error Handling with Recovery

```tsx
import { ErrorRecoveryDialog, ErrorType } from '@/components/platform/error-recovery-dialog';
import { useGoogleSheetsErrorRecovery } from '@/hooks/use-google-sheets-error-recovery';

function MyComponent() {
  const {
    currentError,
    showErrorDialog,
    handleError,
    closeErrorDialog,
    handleRecovered,
  } = useGoogleSheetsErrorRecovery({
    onRecovered: () => {
      // Refresh your data
      loadData();
    },
  });

  const performOperation = async () => {
    try {
      await api.someOperation();
    } catch (error) {
      handleError(error, ErrorType.TOKEN_EXPIRED, 'connection-id');
    }
  };

  return (
    <>
      <button onClick={performOperation}>Perform Operation</button>
      
      {showErrorDialog && currentError && (
        <ErrorRecoveryDialog
          isOpen={showErrorDialog}
          onClose={closeErrorDialog}
          error={currentError}
          onRecovered={handleRecovered}
        />
      )}
    </>
  );
}
```

### 3. Health Monitoring

```tsx
import { ConnectionHealthIndicator } from '@/components/platform/connection-health-indicator';

function MyComponent() {
  return (
    <div className="space-y-4">
      {connections.map(connection => (
        <div key={connection.id} className="flex items-center justify-between p-4 border rounded">
          <span>{connection.name}</span>
          <ConnectionHealthIndicator
            connectionId={connection.id}
            showDetails={true}
            onHealthChange={(health) => {
              if (health.status === 'CRITICAL') {
                // Show notification or take action
                showCriticalAlert(connection.id);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
```

## Complete Integration Example

```tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountSelector } from '@/components/platform/account-selector';
import { ErrorRecoveryDialog } from '@/components/platform/error-recovery-dialog';
import { ConnectionHealthIndicator } from '@/components/platform/connection-health-indicator';
import { useGoogleSheetsErrorRecovery } from '@/hooks/use-google-sheets-error-recovery';

function GoogleSheetsManager() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>();
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [loading, setLoading] = useState(false);

  const {
    currentError,
    showErrorDialog,
    handleError,
    closeErrorDialog,
    handleRecovered,
  } = useGoogleSheetsErrorRecovery({
    onRecovered: () => loadSpreadsheets(),
  });

  const loadSpreadsheets = async () => {
    if (!selectedAccountId) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/connections/${selectedAccountId}/spreadsheets`);
      setSpreadsheets(response.data.spreadsheets);
    } catch (error) {
      handleError(error, undefined, selectedAccountId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAccountId) {
      loadSpreadsheets();
    }
  }, [selectedAccountId]);

  return (
    <div className="space-y-6">
      {/* Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Google Account</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountSelector
            selectedAccountId={selectedAccountId}
            onAccountSelected={(accountId, account) => {
              setSelectedAccountId(accountId);
            }}
            onAddNewAccount={() => {
              window.location.href = '/auth/google-sheets/connect';
            }}
          />
        </CardContent>
      </Card>

      {/* Health Status */}
      {selectedAccountId && (
        <Card>
          <CardHeader>
            <CardTitle>Connection Health</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectionHealthIndicator
              connectionId={selectedAccountId}
              showDetails={true}
              autoRefresh={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Spreadsheets */}
      {selectedAccountId && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Spreadsheets</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div>Loading spreadsheets...</div>
            ) : (
              <div className="space-y-2">
                {spreadsheets.map(sheet => (
                  <div key={sheet.id} className="p-3 border rounded">
                    <h4>{sheet.name}</h4>
                    <p className="text-sm text-gray-600">{sheet.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Recovery Dialog */}
      {showErrorDialog && currentError && (
        <ErrorRecoveryDialog
          isOpen={showErrorDialog}
          onClose={closeErrorDialog}
          error={currentError}
          onRetry={loadSpreadsheets}
          onRecovered={handleRecovered}
        />
      )}
    </div>
  );
}

export default GoogleSheetsManager;
```

## Advanced Usage

### Custom Error Handling

```tsx
import { ErrorType } from '@/components/platform/error-recovery-dialog';

// Custom error categorization
const categorizeCustomError = (error: any): ErrorType => {
  if (error.code === 'CUSTOM_QUOTA_EXCEEDED') {
    return ErrorType.QUOTA_EXCEEDED;
  }
  if (error.message.includes('spreadsheet deleted')) {
    return ErrorType.SPREADSHEET_NOT_FOUND;
  }
  return ErrorType.UNKNOWN_ERROR;
};

// Usage
try {
  await performOperation();
} catch (error) {
  const errorType = categorizeCustomError(error);
  handleError(error, errorType, connectionId);
}
```

### Health Monitoring with Alerts

```tsx
import { HealthStatus } from '@/components/platform/connection-health-indicator';

function HealthMonitoringDashboard() {
  const [criticalConnections, setCriticalConnections] = useState<string[]>([]);

  const handleHealthChange = (connectionId: string, health: any) => {
    if (health.status === HealthStatus.CRITICAL) {
      setCriticalConnections(prev => [...prev, connectionId]);
      
      // Send alert
      sendAlert({
        type: 'CRITICAL_CONNECTION',
        connectionId,
        message: `Connection ${connectionId} is in critical state`,
      });
    } else {
      setCriticalConnections(prev => prev.filter(id => id !== connectionId));
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {connections.map(connection => (
        <Card key={connection.id}>
          <CardHeader>
            <CardTitle>{connection.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConnectionHealthIndicator
              connectionId={connection.id}
              showDetails={true}
              onHealthChange={(health) => handleHealthChange(connection.id, health)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

## API Requirements

Make sure your backend provides these endpoints:

```typescript
// Account management
GET /auth/oauth2/google-sheets/connections/accounts
POST /auth/oauth2/google-sheets/connections/{id}/reauthorize
POST /auth/oauth2/google-sheets/connections/{id}/refresh-token

// Health monitoring
GET /auth/oauth2/google-sheets/connections/{id}/health
POST /auth/oauth2/google-sheets/connections/{id}/test

// Spreadsheet management
GET /auth/oauth2/google-sheets/connections/{id}/connected-spreadsheets
POST /auth/oauth2/google-sheets/connections/{id}/spreadsheets/{spreadsheetId}/connect
DELETE /auth/oauth2/google-sheets/connections/{id}/spreadsheets/{spreadsheetId}/disconnect
```

## Styling and Theming

All components use Tailwind CSS and follow your existing design system. They support:

- Light/dark theme switching
- Responsive design
- Custom CSS classes via `className` prop
- Consistent spacing and typography

## Testing

Run the component tests:

```bash
pnpm test src/components/platform/__tests__/google-sheets-components.test.tsx
```

## Troubleshooting

### Common Issues

1. **Missing Dependencies**: Make sure all Radix UI packages are installed
2. **API Endpoints**: Verify backend endpoints match the expected format
3. **Token Refresh**: Ensure token refresh logic is implemented on the backend
4. **CORS Issues**: Check CORS configuration for OAuth redirects

### Debug Mode

Enable debug logging:

```tsx
// Add to your component
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Google Sheets Debug Mode Enabled');
  }
}, []);
```

## Migration from Existing Components

If you're upgrading from the basic GoogleSheetsConnectionCard:

1. Replace imports:
   ```tsx
   // Old
   import { GoogleSheetsConnectionCard } from './google-sheets-connection-card';
   
   // New
   import { GoogleSheetsMultiAccountManager } from './google-sheets-multi-account-manager';
   ```

2. Update props:
   ```tsx
   // Old
   <GoogleSheetsConnectionCard
     connection={connection}
     onConnectionUpdated={handleUpdate}
     onConnectionDeleted={handleDelete}
   />
   
   // New
   <GoogleSheetsMultiAccountManager />
   ```

3. Handle state management:
   - The new components manage their own state
   - Use the provided callbacks for integration
   - Error handling is built-in

## Performance Considerations

- Health indicators auto-refresh every 60 seconds by default
- Use `autoRefresh={false}` to disable automatic updates
- Implement proper cleanup in useEffect hooks
- Consider using React.memo for expensive re-renders

## Security Notes

- All OAuth flows should use HTTPS in production
- Implement proper CSRF protection
- Store tokens securely on the backend
- Use short-lived access tokens with refresh tokens
- Validate all user inputs and API responses