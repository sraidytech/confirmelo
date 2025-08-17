# Google Sheets Multi-Connection Enhancement Components

This directory contains the enhanced components for Google Sheets multi-connection support, including account selection, error recovery, and connection health monitoring.

## New Components

### 1. AccountSelector Component

**File:** `account-selector.tsx`

A dropdown component for selecting between multiple Google accounts connected to the application.

#### Features:
- Displays all connected Google accounts with avatars and status indicators
- Shows account information (email, name, connection status, connected spreadsheets count)
- Provides "Add New Account" option for connecting additional accounts
- Real-time status updates and health indicators
- Context preservation during account switching

#### Usage:
```tsx
import { AccountSelector } from '@/components/platform/account-selector';

function MyComponent() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>();

  const handleAccountSelected = (accountId: string, account: GoogleAccount) => {
    setSelectedAccountId(accountId);
    // Handle account switching logic
  };

  const handleAddNewAccount = () => {
    // Initiate OAuth flow for new account
  };

  return (
    <AccountSelector
      selectedAccountId={selectedAccountId}
      onAccountSelected={handleAccountSelected}
      onAddNewAccount={handleAddNewAccount}
      placeholder="Select Google account..."
      disabled={false}
    />
  );
}
```

#### Props:
- `selectedAccountId?: string` - Currently selected account ID
- `onAccountSelected: (accountId: string, account: GoogleAccount) => void` - Account selection callback
- `onAddNewAccount: () => void` - Add new account callback
- `className?: string` - Additional CSS classes
- `disabled?: boolean` - Disable the selector
- `placeholder?: string` - Placeholder text

### 2. ErrorRecoveryDialog Component

**File:** `error-recovery-dialog.tsx`

A modal dialog that provides contextual error messages and recovery actions for Google Sheets connection issues.

#### Features:
- Categorizes different types of errors (token expired, revoked, permissions, network, etc.)
- Provides specific recovery actions for each error type
- One-click re-authentication for expired/revoked tokens
- Automatic retry mechanisms for transient errors
- User-friendly error messages with technical details available
- Progress indicators during recovery operations

#### Usage:
```tsx
import { ErrorRecoveryDialog, ErrorType, ErrorDetails } from '@/components/platform/error-recovery-dialog';

function MyComponent() {
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [currentError, setCurrentError] = useState<ErrorDetails | null>(null);

  const handleError = (error: any) => {
    const errorDetails: ErrorDetails = {
      type: ErrorType.TOKEN_EXPIRED,
      message: error.message,
      connectionId: 'connection-id',
      timestamp: new Date().toISOString(),
      code: error.code,
      details: error.details,
    };
    
    setCurrentError(errorDetails);
    setShowErrorDialog(true);
  };

  const handleRetry = async () => {
    // Implement retry logic
  };

  const handleRecovered = () => {
    // Handle successful recovery
    setShowErrorDialog(false);
  };

  return (
    <ErrorRecoveryDialog
      isOpen={showErrorDialog}
      onClose={() => setShowErrorDialog(false)}
      error={currentError}
      onRetry={handleRetry}
      onRecovered={handleRecovered}
    />
  );
}
```

#### Error Types:
- `TOKEN_EXPIRED` - Access token has expired
- `TOKEN_REVOKED` - Access has been revoked
- `INSUFFICIENT_PERMISSIONS` - Missing required permissions
- `NETWORK_ERROR` - Network connectivity issues
- `RATE_LIMITED` - API rate limit exceeded
- `SPREADSHEET_NOT_FOUND` - Spreadsheet doesn't exist
- `SPREADSHEET_ACCESS_DENIED` - No access to spreadsheet
- `QUOTA_EXCEEDED` - API quota exceeded
- `UNKNOWN_ERROR` - Unspecified error

#### Props:
- `isOpen: boolean` - Dialog visibility state
- `onClose: () => void` - Close dialog callback
- `error: ErrorDetails` - Error information object
- `onRetry?: () => void` - Optional retry callback
- `onRecovered?: () => void` - Recovery success callback

### 3. ConnectionHealthIndicator Component

**File:** `connection-health-indicator.tsx`

A component that displays real-time health status of Google Sheets connections with detailed metrics.

#### Features:
- Visual health status indicators (Healthy, Warning, Critical, Unknown)
- Real-time connection status monitoring
- Token expiration warnings
- Connection uptime and response time metrics
- API quota usage tracking
- Automatic refresh with configurable intervals
- Detailed health information in tooltip and expanded view

#### Usage:
```tsx
import { ConnectionHealthIndicator, HealthStatus } from '@/components/platform/connection-health-indicator';

function MyComponent() {
  const handleHealthChange = (health: ConnectionHealth) => {
    console.log('Health status changed:', health.status);
    
    // Handle health status changes
    if (health.status === HealthStatus.CRITICAL) {
      // Show critical error notification
    }
  };

  return (
    <ConnectionHealthIndicator
      connectionId="connection-id"
      showDetails={true}
      autoRefresh={true}
      refreshInterval={60}
      onHealthChange={handleHealthChange}
    />
  );
}
```

#### Health Statuses:
- `HEALTHY` - Connection is working properly
- `WARNING` - Minor issues (token expiring soon, etc.)
- `CRITICAL` - Major issues (token expired, connection failed)
- `UNKNOWN` - Health status cannot be determined

#### Props:
- `connectionId: string` - Connection ID to monitor
- `className?: string` - Additional CSS classes
- `showDetails?: boolean` - Show detailed health information
- `autoRefresh?: boolean` - Enable automatic refresh
- `refreshInterval?: number` - Refresh interval in seconds
- `onHealthChange?: (health: ConnectionHealth) => void` - Health change callback

## Enhanced Integration Example

**File:** `enhanced-google-sheets-connection-card.tsx`

This file demonstrates how to integrate all three components into an enhanced version of the existing GoogleSheetsConnectionCard.

### Key Integration Points:

1. **Account Management**: Uses AccountSelector for multi-account support
2. **Error Handling**: Integrates ErrorRecoveryDialog for comprehensive error recovery
3. **Health Monitoring**: Displays ConnectionHealthIndicator for real-time status
4. **User Experience**: Provides seamless switching between accounts and error recovery

## API Endpoints

These components expect the following API endpoints to be available:

### Account Management:
- `GET /auth/oauth2/google-sheets/connections/accounts` - List Google accounts
- `POST /auth/oauth2/google-sheets/connections/{id}/reauthorize` - Re-authenticate

### Health Monitoring:
- `GET /auth/oauth2/google-sheets/connections/{id}/health` - Get connection health
- `POST /auth/oauth2/google-sheets/connections/{id}/test` - Test connection

### Token Management:
- `POST /auth/oauth2/google-sheets/connections/{id}/refresh-token` - Refresh token

## Dependencies

These components require the following dependencies:

### UI Components:
- `@/components/ui/select` - Dropdown selection
- `@/components/ui/dialog` - Modal dialogs
- `@/components/ui/alert` - Alert messages
- `@/components/ui/badge` - Status badges
- `@/components/ui/button` - Action buttons
- `@/components/ui/avatar` - User avatars
- `@/components/ui/tooltip` - Tooltips
- `@/components/ui/loading-spinner` - Loading indicators

### External Libraries:
- `lucide-react` - Icons
- `date-fns` - Date formatting
- `@radix-ui/react-select` - Select component primitives
- `@radix-ui/react-dialog` - Dialog primitives
- `@radix-ui/react-separator` - Separator component

### Utilities:
- `@/hooks/use-toast` - Toast notifications
- `@/lib/api` - API client
- `@/types/auth` - TypeScript types

## Styling

All components use Tailwind CSS for styling and follow the existing design system patterns. They are fully responsive and support both light and dark themes.

## Testing

Each component includes comprehensive error handling and loading states. For testing:

1. **AccountSelector**: Test with multiple accounts, empty states, and loading states
2. **ErrorRecoveryDialog**: Test different error types and recovery flows
3. **ConnectionHealthIndicator**: Test various health statuses and auto-refresh functionality

## Future Enhancements

Potential improvements for these components:

1. **Offline Support**: Handle offline scenarios gracefully
2. **Batch Operations**: Support bulk account operations
3. **Advanced Filtering**: Filter accounts by status, last activity, etc.
4. **Export/Import**: Export connection configurations
5. **Analytics**: Track usage patterns and error frequencies
6. **Notifications**: Push notifications for health status changes