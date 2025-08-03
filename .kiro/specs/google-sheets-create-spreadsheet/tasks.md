# Implementation Plan

- [x] 1. Create backend API endpoint for Orders spreadsheet creation






  - Add `createOrdersSpreadsheet` method to GoogleSheetsOAuth2Service
  - Implement Orders sheet template with specified headers: Order ID, Date, Name, Phone, Address, City, Product, Product SKU, Product Qty, Product Variant, Price, Page URL
  - Add proper error handling for Google Sheets API failures
  - _Requirements: 2.2, 2.3, 5.2, 5.3, 5.4, 5.5_

- [x] 1.1 Add API endpoint to GoogleSheetsOAuth2Controller



  - Create POST endpoint `/connections/:id/create-orders-spreadsheet`
  - Add proper authentication and authorization checks
  - Implement request validation and error responses
  - _Requirements: 1.3, 3.4, 5.1_

- [x] 1.2 Implement spreadsheet template creation logic

  - Create method to generate Orders sheet with proper headers
  - Add header formatting (bold, background color, frozen row)
  - Set up column formatting for Date, Price, and Quantity fields
  - _Requirements: 2.2, 2.3, 2.4_

- [x] 2. Create frontend CreateSpreadsheetDialog component


  - Build dialog component with form for spreadsheet name input
  - Add validation for spreadsheet name (required, length limits)
  - Implement loading states during creation process
  - _Requirements: 3.1, 3.2, 3.6, 5.1_

- [x] 2.1 Implement spreadsheet creation form

  - Create form with name input field and validation
  - Add default name generation with timestamp
  - Implement form submission with proper error handling
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [x] 2.2 Add success and error handling to dialog

  - Show success message with spreadsheet name
  - Display clear error messages for different failure types
  - Add retry functionality for recoverable errors
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 3. Enhance SpreadsheetSelector with create functionality


  - Add "Create New Spreadsheet" button to toolbar and empty state
  - Integrate CreateSpreadsheetDialog with existing component
  - Update spreadsheet list after successful creation
  - _Requirements: 1.1, 1.2, 4.1, 4.2_

- [x] 3.1 Implement auto-selection of created spreadsheet

  - Automatically add created spreadsheet to the list
  - Auto-select the newly created spreadsheet
  - Continue with integration flow after selection
  - _Requirements: 1.4, 1.5, 4.2, 4.3_

- [x] 3.2 Add visual feedback and loading states

  - Show loading spinner during creation process
  - Display success toast notification
  - Add option to open spreadsheet in Google Sheets
  - _Requirements: 5.1, 5.2, 5.6_

- [x] 4. Test complete user flow and error scenarios


  - Test successful spreadsheet creation end-to-end
  - Verify Orders sheet has correct headers and formatting
  - Test error handling for various failure scenarios
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4_

- [x] 4.1 Test integration with existing spreadsheet selector

  - Verify created spreadsheets appear in list correctly
  - Test that created spreadsheets persist across page refreshes
  - Ensure proper integration with existing selection flow
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4.2 Validate Orders sheet template and formatting

  - Verify all 12 headers are created correctly in order
  - Test that header row is properly formatted (bold, colored)
  - Confirm Date and Price columns have proper formatting
  - _Requirements: 2.2, 2.3, 2.4, 6.2, 6.3_