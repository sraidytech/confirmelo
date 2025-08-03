# Google Sheets Scope Migration Guide

## Issue
After updating the Google OAuth2 scope from `drive.readonly` to `drive.file`, you cannot create new Google Sheets connections because existing connections still use the old scope.

## Error Message
```
"Active connection already exists for GOOGLE_SHEETS. Please revoke the existing connection first."
```

## Solution

### Option 1: Using the Revoke Script (Recommended)

1. **Run the revoke script:**
   ```bash
   cd apps/api
   node scripts/revoke-google-connections.js
   ```

2. **Follow the prompts:**
   - The script will show you all active Google Sheets connections
   - Type `yes` to confirm revoking them
   - All connections will be marked as `REVOKED`

3. **Create new connections:**
   - Go to your application UI
   - Try connecting to Google Sheets again
   - New connections will use the updated `drive.file` scope

### Option 2: Using HTTP Requests

1. **Get your JWT token** from your browser's developer tools or login response

2. **List current connections:**
   ```http
   GET http://localhost:3001/api/auth/oauth2/connections?platformType=GOOGLE_SHEETS
   Authorization: Bearer YOUR_JWT_TOKEN
   ```

3. **Revoke each connection** (replace with actual connection IDs):
   ```http
   DELETE http://localhost:3001/api/auth/oauth2/connections/CONNECTION_ID
   Authorization: Bearer YOUR_JWT_TOKEN
   ```

4. **Create new connection:**
   ```http
   POST http://localhost:3001/api/auth/oauth2/initiate
   Authorization: Bearer YOUR_JWT_TOKEN
   Content-Type: application/json

   {
     "platformType": "GOOGLE_SHEETS",
     "platformName": "My Google Sheets Connection"
   }
   ```

### Option 3: Database Direct Update (Advanced)

If you have direct database access:

```sql
UPDATE "PlatformConnection" 
SET status = 'REVOKED', "updatedAt" = NOW() 
WHERE "platformType" = 'GOOGLE_SHEETS' AND status = 'ACTIVE';
```

## What Changed

### Before (Old Scope)
```javascript
scopes: [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',  // ❌ Restricted scope
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]
```

### After (New Scope)
```javascript
scopes: [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',      // ✅ Non-restricted scope
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]
```

## Benefits of the New Scope

- **No Restricted Scope Review:** `drive.file` doesn't require Google's additional verification
- **Security:** Only grants access to files created by your app or explicitly opened by users
- **Faster Approval:** OAuth2 app approval process is simpler
- **Same Functionality:** Your app can still create, read, and modify spreadsheets

## Verification

After creating new connections, you can verify they're using the correct scope:

1. **Check connection details:**
   ```http
   GET http://localhost:3001/api/auth/oauth2/connections/NEW_CONNECTION_ID
   Authorization: Bearer YOUR_JWT_TOKEN
   ```

2. **Look for the scopes array** in the response - it should contain `drive.file` instead of `drive.readonly`

## Troubleshooting

### "Connection still exists" error
- Make sure you revoked ALL Google Sheets connections
- Check that the status is `REVOKED` in the database
- Restart your API server if needed

### "Invalid scope" error during OAuth
- Verify your Google Cloud Console project has the correct scopes enabled
- Make sure your OAuth2 consent screen is configured properly
- Check that your environment variables are correct

### Users need to re-authorize
- This is expected behavior when changing scopes
- Users will need to go through the OAuth2 flow again
- Their previous spreadsheet access may be limited until they re-authorize

## Next Steps

1. ✅ Revoke existing connections (using one of the methods above)
2. ✅ Test creating new Google Sheets connections
3. ✅ Verify new connections use `drive.file` scope
4. ✅ Update your users about the need to re-connect their Google Sheets
5. ✅ Monitor for any issues with the new scope limitations