# Google Sheets Connection Debug Report

## Issue Summary
You're unable to get/list spreadsheets from your linked Google account, even though the connection was working before.

## Root Cause Analysis

### Understanding `drive.file` Scope Behavior

The current OAuth2 configuration uses these scopes (which is correct):
```
- https://www.googleapis.com/auth/drive.file
- https://www.googleapis.com/auth/spreadsheets.readonly
- https://www.googleapis.com/auth/userinfo.email
- https://www.googleapis.com/auth/userinfo.profile
```

**How `drive.file` Works**: The `drive.file` scope allows access to files that were:
1. **Created by your application**
2. **Explicitly opened/selected by the user through your app**

**The Issue**: If you were seeing spreadsheets before but not now, it could be:
1. Token refresh issues
2. Connection status problems
3. The spreadsheets were created by the app but something changed
4. API endpoint changes

### What Each Scope Does:

1. **`drive.file`** - Only files created by the app
2. **`drive.file`** - Access to specific Drive files (recommended for security)
3. **`drive`** - Full access to ALL Drive files
4. **`spreadsheets.readonly`** - Read access to spreadsheet content (correct)

## Solutions

### Option 1: Keep Current Scopes and Use Enhanced Features

The current `drive.file` scope is actually good for security. I've enhanced the system to work better with it:

**New Features Added:**
1. **Enhanced spreadsheet listing** - Better error handling and logging
2. **Add existing spreadsheet endpoint** - Users can add spreadsheets by URL/ID
3. **Scope testing endpoint** - Debug what permissions are available
4. **Better error messages** - Clear indication of what's wrong

### Option 2: Test with Current Scopes

The current implementation should work for:
- Creating new spreadsheets via the API
- Accessing spreadsheets that were created by your app
- Reading user information

## Enhanced Debugging

I've added several debugging features to help identify the exact issue:

### 1. Enhanced Error Messages
The `listSpreadsheets` method now provides detailed error information including:
- HTTP status codes
- Specific error messages about scope issues
- Suggestions for fixing permission problems

### 2. Scope Testing Endpoint
New endpoint: `POST /auth/oauth2/google-sheets/connections/:id/test-scopes`

This will test:
- What scopes are actually granted
- Whether Drive API access works
- Whether Sheets API access works
- User info access

### 3. Debug Scripts
Created test scripts to help diagnose the issue:
- `apps/api/test-google-connection.js` - Automated testing script
- `apps/api/debug-google-sheets.js` - Manual API testing

## Testing Steps

1. **Test Current Connection:**
   ```bash
   # Start your API server
   npm run start:dev
   
   # Test the connection (replace CONNECTION_ID and JWT_TOKEN)
   curl -X POST "http://localhost:3000/auth/oauth2/google-sheets/connections/YOUR_CONNECTION_ID/test-scopes" \
        -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

2. **Check Logs:**
   The enhanced logging will show exactly what's happening when you try to list spreadsheets.

3. **Try Creating a Test Spreadsheet:**
   ```bash
   curl -X POST "http://localhost:3000/auth/oauth2/google-sheets/connections/YOUR_CONNECTION_ID/spreadsheets" \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"title": "Test Spreadsheet"}'
   ```

## Expected Behavior

### With Current Scopes (`drive.file`):
- ✅ Create new spreadsheets
- ✅ Access app-created spreadsheets
- ❌ List existing user spreadsheets
- ❌ Access user-created spreadsheets

### With Updated Scopes (`drive.file`):
- ✅ Create new spreadsheets
- ✅ Access app-created spreadsheets
- ✅ List existing user spreadsheets
- ✅ Access user-created spreadsheets (read-only)

## Immediate Action Items

1. **Check the exact error message** when listing spreadsheets
2. **Test the scope testing endpoint** to see what permissions are actually granted
3. **Update OAuth2 scopes** in Google Cloud Console if needed
4. **Re-authorize the connection** after scope changes

## Files Modified

- `apps/api/src/modules/auth/services/google-sheets-oauth2.service.ts` - Enhanced error handling and debugging
- `apps/api/src/modules/auth/controllers/google-sheets-oauth2.controller.ts` - Added scope testing endpoint
- `apps/api/test-google-connection.js` - Debug script
- `apps/api/debug-google-sheets.js` - Manual testing script

The system is now much better equipped to help diagnose and resolve the spreadsheet listing issue.