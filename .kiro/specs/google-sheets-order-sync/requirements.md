# Requirements Document

## Introduction

This feature enables automatic synchronization of orders from Google Sheets to the Confirmelo database, treating Google Sheets as an order source similar to Youcan and Shopify platforms. Clients can connect their Google Sheets containing orders, and the system will automatically import them into the order management system for call center processing. The system supports multiple clients (50+) each with their own sheets, handling up to 5,000 orders per day with flexible column mapping and multiple sync triggers.

## Requirements

### Requirement 1

**User Story:** As a client, I want to connect my Google account to Confirmelo and create order sheets directly from the app, so that my orders are automatically synced in real-time and processed by the call center team.

#### Acceptance Criteria

1. WHEN a client adds a new row to their app-created Google Sheet THEN the system SHALL detect the new order immediately via webhook
2. WHEN the order data is valid THEN the system SHALL create a new order in the database with status "NEW" and source "GOOGLE_SHEETS" in real-time
3. WHEN the order is successfully imported THEN the system SHALL update the sheet with the internal order ID and import timestamp within seconds
4. IF required fields (Phone, Product, Price) are missing THEN the system SHALL mark the row as invalid and log the error immediately
5. WHEN an order is imported THEN the system SHALL create or link to existing customer based on phone number and assign to the client's organization

### Requirement 2

**User Story:** As a client admin, I want to connect my Google account to Confirmelo and create order sheets with predefined columns, so that I can start importing orders immediately without configuration.

#### Acceptance Criteria

1. WHEN a client admin connects their Google account THEN the system SHALL authenticate using OAuth2 and store the connection securely
2. WHEN creating a new order sheet THEN the system SHALL automatically create a Google Sheet with predefined columns matching the order structure
3. WHEN the sheet is created THEN the system SHALL automatically set up webhook notifications for real-time sync
4. WHEN the sheet is ready THEN the system SHALL enable order sync automatically with the standard column mapping
5. WHEN sync is active THEN the system SHALL display the sheet connection status and last sync information

### Requirement 3

**User Story:** As a client, I want to use the predefined Google Sheet structure created by Confirmelo, so that I can start entering orders immediately without worrying about column mapping or configuration.

#### Acceptance Criteria

1. WHEN a sheet is created from the app THEN the system SHALL use the standard order columns (Order ID, Date, Name, Phone, Address, City, Product, Product SKU, Product Qty, Product Variant, Price, Page URL)
2. WHEN the sheet is set up THEN the system SHALL automatically map all columns to the corresponding order fields
3. WHEN orders are entered THEN the system SHALL validate data against the predefined field requirements
4. WHEN additional custom fields are needed THEN the system SHALL allow clients to request custom column additions
5. WHEN the standard structure is used THEN the system SHALL ensure 100% compatibility with the order import process

### Requirement 4

**User Story:** As a system administrator, I want duplicate orders to be detected and handled appropriately across all client sheets, so that the same order is not imported multiple times into the system.

#### Acceptance Criteria

1. WHEN importing an order THEN the system SHALL check for duplicates within the same client organization based on phone number and order date within 24 hours
2. WHEN a potential duplicate is found THEN the system SHALL compare order details (products, price, address) within the client's scope
3. IF the order is an exact duplicate THEN the system SHALL skip import and mark the sheet row as "duplicate"
4. IF the order has similar but different details THEN the system SHALL flag it for manual review by the client admin
5. WHEN handling duplicates THEN the system SHALL log all duplicate detection decisions with client context

### Requirement 5

**User Story:** As a system administrator, I want to monitor sync status and errors across all client sheets, so that I can ensure orders are being imported correctly and address any issues that affect call center operations.

#### Acceptance Criteria

1. WHEN sync operations occur THEN the system SHALL log all sync activities with timestamps and client context
2. WHEN errors occur during sync THEN the system SHALL record error details, affected rows, and client information
3. WHEN viewing sync status THEN administrators SHALL see last sync time, success/error counts, and pending items per client
4. WHEN errors need attention THEN the system SHALL provide actionable error messages and notify relevant client admins
5. WHEN sync issues are resolved THEN administrators SHALL be able to retry failed imports for specific clients

### Requirement 6

**User Story:** As a client, I want my orders to be synced in real-time using webhooks, so that my orders reach the call center team immediately when I add them to the sheet.

#### Acceptance Criteria

1. WHEN a sheet is created from the app THEN the system SHALL automatically set up Google Sheets webhook notifications for real-time sync
2. WHEN a new order is added to the sheet THEN the webhook SHALL trigger immediate sync within seconds
3. WHEN webhook notifications fail THEN the system SHALL fall back to polling every 2 minutes as backup
4. WHEN a client admin clicks manual sync THEN the system SHALL immediately check for and import any missed orders
5. WHEN real-time sync is working THEN the system SHALL process new orders immediately without batching delays

### Requirement 7

**User Story:** As a client's data entry person, I want clear feedback on order validation in my Google Sheet, so that I can correct any errors and ensure my orders are properly imported for call center processing.

#### Acceptance Criteria

1. WHEN order data fails validation THEN the system SHALL update the client's sheet with specific error messages in a designated error column
2. WHEN phone number format is invalid THEN the system SHALL provide format guidance specific to the client's market (Morocco/international)
3. WHEN product is not found in the client's catalog THEN the system SHALL suggest similar products or flag for product creation
4. WHEN price is invalid THEN the system SHALL specify the expected format and currency for that client
5. WHEN validation passes THEN the system SHALL clear any previous error messages and mark the row as successfully imported

### Requirement 8

**User Story:** As a system administrator, I want the sync process to handle high volumes efficiently across all 50+ clients, so that up to 5,000 orders per day can be processed without performance issues affecting call center operations.

#### Acceptance Criteria

1. WHEN processing large batches THEN the system SHALL handle up to 100 orders per sync operation per client
2. WHEN sync volume is high across multiple clients THEN the system SHALL queue operations to prevent Google API rate limiting
3. WHEN processing orders THEN the system SHALL complete each client batch within 30 seconds
4. WHEN errors occur in batch processing THEN the system SHALL continue processing remaining orders and other clients
5. WHEN daily volume approaches limits THEN the system SHALL alert administrators and prioritize high-value clients

### Requirement 9

**User Story:** As a client, I want to connect my Google account directly to Confirmelo through a secure OAuth2 flow, so that I can create and manage order sheets without sharing credentials.

#### Acceptance Criteria

1. WHEN a client initiates Google account connection THEN the system SHALL redirect to Google OAuth2 authorization with appropriate scopes
2. WHEN authorization is granted THEN the system SHALL securely store the access and refresh tokens for the client's organization
3. WHEN tokens expire THEN the system SHALL automatically refresh them to maintain continuous access
4. WHEN connection is established THEN the client SHALL be able to create multiple order sheets from within the Confirmelo app
5. WHEN managing connections THEN clients SHALL be able to view connection status and reconnect if needed

### Requirement 10

**User Story:** As a call center manager, I want imported Google Sheets orders to integrate seamlessly with the existing order workflow, so that they can be processed by agents like any other order from Youcan or Shopify.

#### Acceptance Criteria

1. WHEN an order is imported from Google Sheets THEN the system SHALL assign it to the appropriate client store and mark source as "GOOGLE_SHEETS"
2. WHEN customer information is provided THEN the system SHALL create or update customer records within the client's organization scope
3. WHEN products are specified THEN the system SHALL link to existing products in the client's catalog or flag for creation
4. WHEN orders are imported THEN the system SHALL apply client-specific settings (currency, timezone, assignment rules)
5. WHEN import is complete THEN orders SHALL be available for assignment to call center agents through the normal workflow queue