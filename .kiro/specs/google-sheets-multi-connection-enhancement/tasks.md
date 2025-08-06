# Implementation Plan

- [x] 1. Database Schema Updates and Migration


  - Create new spreadsheet_connections table to support multiple spreadsheets per connection
  - Update platform_connections table constraints to allow multiple Google accounts
  - Create database migration scripts with proper rollback support
  - Add necessary indexes for performance optimization
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 6.1, 6.2_

- [x] 1.1 Create spreadsheet_connections table migration



  - Write Prisma migration to create spreadsheet_connections table with proper relationships
  - Add foreign key constraints and indexes for optimal performance
  - Include JSONB field for storing sheet metadata
  - _Requirements: 2.1, 2.2, 6.1_



- [x] 1.2 Update platform_connections table constraints
  - Remove existing unique constraint that prevents multiple Google accounts
  - Add new unique constraint based on user, platform type, and Google email
  - Create index on Google email field for better query performance
  - _Requirements: 3.1, 3.2, 6.1_

- [ ] 1.3 Create data migration script for existing connections




  - Write migration script to convert existing single-spreadsheet connections to new format
  - Create spreadsheet_connections records for existing connected spreadsheets
  - Update platform_data with Google account information
  - Add rollback capability for safe deployment
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 2. Enhanced Token Management System

  - Implement automatic token refresh mechanism with proactive refresh strategy
  - Add token validation and refresh retry logic with exponential backoff
  - Create token refresh scheduling system to prevent expiration
  - Enhance error handling for various token refresh failure scenarios
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2_

- [x] 2.1 Implement proactive token refresh mechanism


  - Add token expiration checking before API calls
  - Implement automatic refresh when token has less than 10 minutes remaining
  - Create token refresh queue to handle concurrent refresh requests
  - Add proper locking to prevent duplicate refresh attempts
  - _Requirements: 1.1, 1.2, 1.5, 1.6_


- [x] 2.2 Enhance OAuth2Service with improved token management
  - Update getAccessToken method to automatically refresh expired tokens
  - Add validateAndRefreshToken method for proactive token validation
  - Implement retry logic with exponential backoff for refresh failures
  - Add comprehensive error handling for different refresh failure scenarios
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2_



- [x] 2.3 Create token refresh scheduling system
  - Implement background job to check and refresh tokens before expiration
  - Add token refresh monitoring and alerting for failed refreshes
  - Create token health check endpoint for monitoring
  - _Requirements: 1.1, 1.5, 5.1_

- [x] 3. Multi-Spreadsheet Connection Service
  - Create SpreadsheetConnectionService to manage multiple spreadsheet connections
  - Implement CRUD operations for spreadsheet connections
  - Add spreadsheet metadata caching and refresh functionality
  - Create spreadsheet permission validation and access control
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_



- [ ] 3.1 Create SpreadsheetConnectionService class
  - Implement connectSpreadsheet method to add new spreadsheet connections
  - Add disconnectSpreadsheet method to remove specific spreadsheet connections
  - Create listConnectedSpreadsheets method to retrieve all connected spreadsheets
  - Implement getSpreadsheetConnection method for individual spreadsheet details


  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 3.2 Add spreadsheet metadata management
  - Implement refreshSpreadsheetInfo method to update spreadsheet metadata
  - Add sheet information caching with automatic refresh
  - Create spreadsheet permission checking and validation
  - Implement spreadsheet access verification before operations
  - _Requirements: 2.3, 2.5, 5.4_

- [ ] 3.3 Integrate SpreadsheetConnectionService with existing services
  - Update GoogleSheetsOAuth2Service to use SpreadsheetConnectionService
  - Modify existing spreadsheet operations to work with multiple connections
  - Add backward compatibility layer for existing single-spreadsheet operations
  - _Requirements: 2.5, 6.4, 6.5_

- [x] 4. Multi-Account Support Implementation
  - Remove unique constraint preventing multiple Google account connections
  - Update authentication flow to support multiple account connections
  - Enhance connection management to handle multiple accounts per user
  - Add account identification and labeling functionality
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 4.1 Update authentication flow for multi-account support
  - Modify initiateGoogleAuthorization to allow multiple account connections
  - Update completeGoogleAuthorization to create separate connections per account
  - Remove existing connection revocation logic that prevents multiple accounts
  - Add account email extraction and storage in platform_data
  - _Requirements: 3.1, 3.2, 3.7_

- [ ] 4.2 Enhance connection identification and labeling
  - Update platformName generation to include Google account email
  - Add account labeling functionality for user-friendly identification
  - Implement account grouping logic for UI display
  - Create account-specific connection metadata
  - _Requirements: 3.2, 3.3, 4.2, 4.5_

- [ ] 4.3 Update connection management for multiple accounts
  - Modify connection listing to support multiple Google accounts
  - Add account-specific connection filtering and sorting
  - Implement account isolation for connection operations
  - Create account-specific error handling and recovery
  - _Requirements: 3.3, 3.4, 3.6, 5.6_

- [x] 5. Enhanced Google Sheets Service
  - Update GoogleSheetsOAuth2Service to support multiple spreadsheets and accounts
  - Add context-aware spreadsheet operations with automatic token refresh
  - Implement improved error handling with recovery suggestions
  - Create batch operations for multiple spreadsheet management
  - _Requirements: 2.1, 2.5, 3.4, 3.5, 5.3, 5.4_

- [ ] 5.1 Update core GoogleSheetsOAuth2Service methods
  - Enhance listSpreadsheets to work with multiple connected spreadsheets
  - Update createSpreadsheet to automatically add to connected spreadsheets
  - Modify all spreadsheet operations to include automatic token refresh
  - Add connection context validation for all operations
  - _Requirements: 2.5, 2.6, 3.4, 3.5_

- [ ] 5.2 Implement multi-spreadsheet operation methods
  - Add connectToSpreadsheet method for adding new spreadsheet connections
  - Create disconnectFromSpreadsheet method for removing connections
  - Implement getConnectedSpreadsheets method for listing connected sheets
  - Add performSpreadsheetOperation method with connection context
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5.3 Enhance error handling and recovery
  - Implement comprehensive error categorization and recovery strategies
  - Add automatic retry logic for transient errors
  - Create user-friendly error messages with recovery suggestions
  - Implement connection health monitoring and alerting
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Backend API Controller Updates
  - Update GoogleSheetsOAuth2Controller to support multi-account and multi-spreadsheet operations
  - Add new endpoints for spreadsheet connection management
  - Enhance existing endpoints with improved error handling
  - Create account-specific operation endpoints
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.4, 4.1, 4.2_

- [ ] 6.1 Update existing controller endpoints
  - Modify initiate and complete authorization endpoints for multi-account support
  - Update connection listing endpoints to show multiple accounts and spreadsheets
  - Enhance test connection endpoint with multi-spreadsheet validation
  - Add backward compatibility for existing API consumers
  - _Requirements: 3.1, 3.2, 3.3, 6.4, 6.5_

- [ ] 6.2 Add new spreadsheet connection management endpoints
  - Create POST /connections/:id/spreadsheets/:spreadsheetId/connect endpoint
  - Add DELETE /connections/:id/spreadsheets/:spreadsheetId/disconnect endpoint
  - Implement GET /connections/:id/connected-spreadsheets endpoint
  - Create POST /connections/:id/spreadsheets/batch-connect endpoint for multiple connections
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 6.3 Add account-specific operation endpoints
  - Create GET /connections/accounts endpoint to list Google accounts
  - Add POST /connections/accounts/:email/spreadsheets endpoint for account-specific operations
  - Implement account selection validation for all operations
  - _Requirements: 3.3, 3.4, 3.5, 4.1, 4.2_

- [ ] 7. Frontend Component Enhancements
  - Update PlatformConnectionManager to support multiple Google accounts
  - Enhance GoogleSheetsConnectionCard to show multiple connected spreadsheets
  - Update SpreadsheetSelector to support multi-selection and account context
  - Create new AccountSelector component for account switching
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 7.1 Update PlatformConnectionManager component
  - Add account grouping functionality for Google Sheets connections
  - Implement "Add Another Google Account" button and flow
  - Create account-specific connection display with email identification
  - Add account expansion/collapse functionality for better organization
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ] 7.2 Enhance GoogleSheetsConnectionCard component
  - Update to display multiple connected spreadsheets in a list format
  - Add individual spreadsheet connect/disconnect functionality
  - Implement spreadsheet status indicators and last accessed information
  - Create spreadsheet management actions (view, disconnect, refresh)
  - _Requirements: 4.2, 4.4, 2.3, 2.4_

- [ ] 7.3 Update SpreadsheetSelector for multi-selection support
  - Add checkbox selection for multiple spreadsheets
  - Implement account context awareness for spreadsheet filtering
  - Create batch connect/disconnect operations
  - Add spreadsheet search and filtering within account context
  - _Requirements: 2.1, 2.2, 2.5, 4.6_

- [ ] 7.4 Create AccountSelector component
  - Implement dropdown/selector for choosing Google accounts
  - Add account information display (email, avatar, connection status)
  - Create "Add New Account" option within selector
  - Implement account switching with proper context preservation
  - _Requirements: 3.3, 3.4, 4.6_

- [ ] 8. Error Handling and Recovery UI
  - Create enhanced error display components with recovery actions
  - Implement user-friendly error messages for common scenarios
  - Add one-click re-authentication flows for expired connections
  - Create connection health indicators and status displays
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 8.1 Create ErrorRecoveryDialog component
  - Implement contextual error messages with specific recovery actions
  - Add one-click re-authentication button for expired tokens
  - Create retry mechanisms for transient errors
  - Implement error categorization with appropriate user guidance
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 8.2 Add connection health indicators
  - Create visual status indicators for connection health
  - Implement real-time connection status updates
  - Add proactive warnings for upcoming token expirations
  - Create connection health dashboard for administrators
  - _Requirements: 5.1, 5.5, 5.6_

- [x] 9. Testing and Quality Assurance
  - Create comprehensive unit tests for all new services and components
  - Implement integration tests for multi-account and multi-spreadsheet workflows
  - Add end-to-end tests for complete user journeys
  - Create performance tests for token refresh and multi-spreadsheet operations
  - _Requirements: All requirements need testing coverage_

- [ ] 9.1 Unit tests for backend services
  - Write tests for SpreadsheetConnectionService CRUD operations
  - Create tests for enhanced OAuth2Service token refresh logic
  - Add tests for multi-account authentication flows
  - Implement tests for error handling and recovery mechanisms
  - _Requirements: 1.1, 1.2, 2.1, 3.1, 5.1_

- [ ] 9.2 Integration tests for API endpoints
  - Create tests for multi-account connection management endpoints
  - Add tests for spreadsheet connection CRUD operations
  - Implement tests for token refresh during API operations
  - Create tests for backward compatibility with existing clients
  - _Requirements: 2.1, 3.1, 6.4, 6.5_

- [ ] 9.3 Frontend component tests
  - Write tests for enhanced PlatformConnectionManager functionality
  - Create tests for multi-spreadsheet GoogleSheetsConnectionCard
  - Add tests for AccountSelector component interactions
  - Implement tests for error handling and recovery UI flows
  - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2_

- [ ] 9.4 End-to-end workflow tests
  - Create tests for complete multi-account setup workflow
  - Add tests for multi-spreadsheet connection and operation workflows
  - Implement tests for token refresh and error recovery scenarios
  - Create tests for migration from single to multi-account setup
  - _Requirements: All requirements integrated testing_

- [ ] 10. Documentation and Migration Guide
  - Create user documentation for new multi-account and multi-spreadsheet features
  - Write technical documentation for API changes and new endpoints
  - Develop migration guide for existing users and integrations
  - Create troubleshooting guide for common issues and recovery
  - _Requirements: 5.4, 5.5, 6.1, 6.2, 6.3_

- [ ] 10.1 User documentation updates
  - Write guide for setting up multiple Google accounts
  - Create documentation for managing multiple spreadsheet connections
  - Add troubleshooting section for authentication and connection issues
  - Create best practices guide for multi-account workflows
  - _Requirements: 4.1, 4.2, 5.4, 5.5_

- [ ] 10.2 Technical API documentation
  - Document new spreadsheet connection management endpoints
  - Update existing endpoint documentation with multi-account support
  - Create API migration guide for existing integrations
  - Add code examples for common multi-account scenarios
  - _Requirements: 6.4, 6.5_

- [ ] 10.3 Deployment and rollback procedures
  - Create deployment checklist with database migration steps
  - Document rollback procedures for each deployment phase
  - Create monitoring and alerting setup for new functionality
  - Add performance monitoring guidelines for multi-account usage
  - _Requirements: 6.1, 6.2_