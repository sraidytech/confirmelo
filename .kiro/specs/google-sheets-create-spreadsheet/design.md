# Design Document

## Overview

This feature adds a "Create New Spreadsheet" button to the Google Sheets spreadsheet selector that creates a new Google Spreadsheet with a pre-configured Orders sheet. This solves the `drive.file` scope limitation where users can't see existing spreadsheets, by providing an easy way to create new spreadsheets that are immediately accessible.

## Architecture

### Frontend Components
- **SpreadsheetSelector Component**: Enhanced with create functionality
- **CreateSpreadsheetDialog Component**: New dialog for spreadsheet creation
- **SpreadsheetCreationForm Component**: Form for entering spreadsheet details

### Backend Services
- **GoogleSheetsOAuth2Service**: Enhanced with template creation methods
- **GoogleSheetsOAuth2Controller**: New endpoint for template-based creation

### Data Flow
1. User clicks "Create New Spreadsheet" button
2. Frontend shows creation dialog
3. User enters spreadsheet name
4. Frontend calls backend API with template specification
5. Backend creates spreadsheet with Orders template
6. Backend returns spreadsheet details
7. Frontend adds spreadsheet to list and auto-selects it

## Components and Interfaces

### Frontend Components

#### CreateSpreadsheetDialog Component
```typescript
interface CreateSpreadsheetDialogProps {
  connectionId: string;
  isOpen: boolean;
  onClose: () => void;
  onSpreadsheetCreated: (spreadsheet: CreatedSpreadsheet) => void;
}

interface CreatedSpreadsheet {
  id: string;
  name: string;
  webViewLink: string;
  sheets: Array<{
    id: number;
    name: string;
    index: number;
  }>;
}
```

#### SpreadsheetCreationForm Component
```typescript
interface SpreadsheetCreationFormProps {
  onSubmit: (data: CreateSpreadsheetData) => void;
  isLoading: boolean;
}

interface CreateSpreadsheetData {
  name: string;
  template: 'orders'; // Fixed to orders template
}
```

### Backend Interfaces

#### API Endpoint
```typescript
// POST /auth/oauth2/google-sheets/connections/:id/create-orders-spreadsheet
interface CreateOrdersSpreadsheetDto {
  name: string;
}

interface CreateOrdersSpreadsheetResponse {
  success: boolean;
  spreadsheet?: {
    id: string;
    name: string;
    webViewLink: string;
    sheets: Array<{
      id: number;
      name: string;
      index: number;
    }>;
  };
  error?: string;
}
```

#### Service Methods
```typescript
class GoogleSheetsOAuth2Service {
  async createOrdersSpreadsheet(
    connectionId: string,
    name: string
  ): Promise<CreateOrdersSpreadsheetResponse>;
  
  private async createSpreadsheetWithOrdersTemplate(
    accessToken: string,
    name: string
  ): Promise<GoogleSpreadsheet>;
  
  private getOrdersSheetHeaders(): string[];
}
```

## Data Models

### Orders Sheet Structure
```typescript
interface OrdersSheetTemplate {
  name: 'Orders';
  headers: [
    'Order ID',
    'Date', 
    'Name',
    'Phone',
    'Address',
    'City',
    'Product',
    'Product SKU',
    'Product Qty',
    'Product Variant',
    'Price',
    'Page URL'
  ];
  formatting: {
    headerRow: {
      bold: true;
      backgroundColor: '#4285f4';
      textColor: '#ffffff';
    };
    columns: {
      'Date': { format: 'DATE' };
      'Price': { format: 'CURRENCY' };
      'Product Qty': { format: 'NUMBER' };
    };
  };
}
```

### Spreadsheet Creation Request
```typescript
interface SpreadsheetCreationRequest {
  properties: {
    title: string;
    locale: 'en_US';
    autoRecalc: 'ON_CHANGE';
    timeZone: 'UTC';
  };
  sheets: [
    {
      properties: {
        title: 'Orders';
        index: 0;
        sheetType: 'GRID';
        gridProperties: {
          rowCount: 1000;
          columnCount: 12; // Number of headers
          frozenRowCount: 1; // Freeze header row
        };
      };
    }
  ];
}
```

## Error Handling

### Frontend Error Handling
```typescript
interface CreateSpreadsheetError {
  type: 'VALIDATION' | 'PERMISSION' | 'NETWORK' | 'UNKNOWN';
  message: string;
  details?: any;
  retryable: boolean;
}

const handleCreateError = (error: CreateSpreadsheetError) => {
  switch (error.type) {
    case 'VALIDATION':
      showValidationError(error.message);
      break;
    case 'PERMISSION':
      showPermissionError('Please check your Google Sheets connection');
      break;
    case 'NETWORK':
      showRetryableError(error.message, () => retryCreation());
      break;
    default:
      showGenericError('Failed to create spreadsheet. Please try again.');
  }
};
```

### Backend Error Handling
```typescript
class GoogleSheetsOAuth2Service {
  async createOrdersSpreadsheet(connectionId: string, name: string) {
    try {
      // Validate connection
      const connection = await this.validateConnection(connectionId);
      
      // Get access token
      const accessToken = await this.getAccessToken(connectionId);
      
      // Create spreadsheet
      const spreadsheet = await this.createSpreadsheetWithOrdersTemplate(accessToken, name);
      
      // Set up headers and formatting
      await this.setupOrdersSheet(accessToken, spreadsheet.spreadsheetId);
      
      return { success: true, spreadsheet };
    } catch (error) {
      this.logger.error('Failed to create orders spreadsheet', { error, connectionId, name });
      
      if (error.message.includes('403')) {
        return { success: false, error: 'Permission denied. Please reconnect your Google account.' };
      }
      
      if (error.message.includes('quota')) {
        return { success: false, error: 'Google API quota exceeded. Please try again later.' };
      }
      
      return { success: false, error: 'Failed to create spreadsheet. Please try again.' };
    }
  }
}
```

## Testing Strategy

### Unit Tests
- **CreateSpreadsheetDialog**: Test dialog open/close, form validation, error handling
- **SpreadsheetCreationForm**: Test form submission, validation, loading states
- **GoogleSheetsOAuth2Service**: Test spreadsheet creation, template setup, error scenarios

### Integration Tests
- **API Endpoint**: Test complete creation flow with valid/invalid data
- **Google Sheets API**: Test actual spreadsheet creation and formatting
- **OAuth2 Flow**: Test with different connection states and permissions

### E2E Tests
- **Complete User Flow**: From clicking create button to spreadsheet appearing in list
- **Error Scenarios**: Test various error conditions and user recovery
- **Cross-browser**: Test in different browsers and screen sizes

## Implementation Plan

### Phase 1: Backend Implementation
1. Add `createOrdersSpreadsheet` method to service
2. Implement Orders sheet template creation
3. Add API endpoint to controller
4. Add proper error handling and logging
5. Write unit tests for service methods

### Phase 2: Frontend Implementation
1. Create `CreateSpreadsheetDialog` component
2. Create `SpreadsheetCreationForm` component
3. Enhance `SpreadsheetSelector` with create button
4. Implement error handling and user feedback
5. Add loading states and success messages

### Phase 3: Integration and Testing
1. Connect frontend to backend API
2. Test complete user flow
3. Handle edge cases and error scenarios
4. Add comprehensive error messages
5. Performance testing and optimization

### Phase 4: UI/UX Polish
1. Add animations and transitions
2. Improve loading states and feedback
3. Add tooltips and help text
4. Responsive design improvements
5. Accessibility enhancements

## Security Considerations

### OAuth2 Permissions
- Verify user has active Google Sheets connection
- Validate connection belongs to user's organization
- Check user has permission to create spreadsheets

### Input Validation
- Sanitize spreadsheet names
- Validate name length and characters
- Prevent injection attacks in sheet names

### Rate Limiting
- Implement rate limiting for spreadsheet creation
- Prevent abuse of Google Sheets API quota
- Add cooldown periods for failed attempts

## Performance Considerations

### API Optimization
- Batch Google Sheets API calls where possible
- Use efficient sheet formatting operations
- Minimize API calls during creation

### Frontend Performance
- Lazy load creation dialog components
- Debounce form validation
- Optimize re-renders during creation process

### Caching Strategy
- Cache created spreadsheet metadata
- Store template configurations
- Cache user permissions and connection status

## Monitoring and Analytics

### Metrics to Track
- Spreadsheet creation success/failure rates
- Time to create spreadsheet
- User adoption of create feature
- Error types and frequencies

### Logging Strategy
- Log all creation attempts with user context
- Track API response times and errors
- Monitor Google Sheets API quota usage
- Alert on high failure rates

## Future Enhancements

### Template Variations
- Allow customization of Orders sheet headers
- Add optional additional sheets (Products, Customers)
- Support for different business types

### Advanced Features
- Bulk spreadsheet creation
- Template sharing between organizations
- Custom formatting options
- Integration with existing data sources