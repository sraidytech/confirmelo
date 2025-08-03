# Google OAuth2 Scopes Update Guide

## Issue Summary
Your Google Sheets connection is working (authentication successful), but you can't access spreadsheets in your Google Drive. This is because the current OAuth2 scopes are too restrictive.

## Current vs Required Scopes

### Current Scopes (Too Restrictive)
```
❌ https://www.googleapis.com/auth/drive.file          (only app-created files)
❌ https://www.googleapis.com/auth/spreadsheets.readonly (read-only access)
✅ https://www.googleapis.com/auth/userinfo.email
✅ https://www.googleapis.com/auth/userinfo.profile
```

### Updated Scopes (Recommended)
```
✅ https://www.googleapis.com/auth/spreadsheets        (full spreadsheet access)
✅ https://www.googleapis.com/auth/drive.file         (access specific Drive files)
✅ https://www.googleapis.com/auth/userinfo.email
✅ https://www.googleapis.com/auth/userinfo.profile
```

## Step-by-Step Fix

### 1. Update Google Cloud Console

1. **Go to Google Cloud Console**: https://console.cloud.google.com
2. **Select your project** (the one with your OAuth2 credentials)
3. **Navigate to APIs & Services > OAuth consent screen**
4. **Click "Edit App"**
5. **Go to "Scopes" section**
6. **Remove the old scopes**:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
7. **Add the new scopes**:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
8. **Keep the existing scopes**:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
9. **Save the changes**

### 2. Code Changes (Already Done)

The code has been updated in `apps/api/src/modules/auth/services/oauth2-config.service.ts`:

```typescript
scopes: [
  'https://www.googleapis.com/auth/spreadsheets',        // Full spreadsheet access
  'https://www.googleapis.com/auth/drive.file',          // Access specific Drive files
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
],
```

### 3. Re-authorize Your Connection

After updating the scopes in Google Cloud Console:

1. **Revoke existing connection** in your app
2. **Create a new connection** to get the updated scopes
3. **Test the connection** to verify it works

### 4. Test the Updated Scopes

Use the testing script to verify everything works:

```bash
cd apps/api
node test-google-scopes.js
```

This will test:
- ✅ Token validity and scopes
- ✅ User information access
- ✅ Google Drive access
- ✅ Google Sheets API access
- ✅ Spreadsheet listing from Drive

## What Each Scope Does

| Scope | Access Level | What It Allows |
|-------|-------------|----------------|
| `drive.file` | Limited | Only files created by your app |
| `drive.file` | Limited | Access to specific Drive files |
| `drive` | Full | Read/write access to ALL Drive files |
| `spreadsheets.readonly` | Limited | Read-only access to spreadsheet content |
| `spreadsheets` | Full | Full read/write access to spreadsheets |

## Expected Results After Fix

### Before (Current Issue)
- ✅ Authentication works
- ✅ User info accessible
- ❌ Cannot list existing spreadsheets
- ❌ Cannot access user's spreadsheets

### After (With Updated Scopes)
- ✅ Authentication works
- ✅ User info accessible
- ✅ Can list all user's spreadsheets
- ✅ Can read/write to spreadsheets
- ✅ Can create new spreadsheets

## Troubleshooting

### If you still can't access spreadsheets after updating:

1. **Check the actual scopes granted**:
   ```bash
   # Use the test script to see what scopes are actually granted
   node test-google-scopes.js
   ```

2. **Verify Google Cloud Console settings**:
   - Make sure the new scopes are saved
   - Check that the OAuth2 consent screen is published (not in testing mode)

3. **Clear browser cache** and re-authorize

4. **Check API enablement**:
   - Google Sheets API should be enabled
   - Google Drive API should be enabled

### Common Issues

- **"Insufficient permissions"**: Scopes not updated in Google Cloud Console
- **"Access denied"**: Need to re-authorize with new scopes
- **"API not enabled"**: Enable Google Sheets API and Google Drive API

## Security Considerations

The updated scopes (`drive.file` and `spreadsheets`) provide appropriate access while maintaining security:

- `drive.file`: Access only to specific Drive files used by the app (more secure)
- `spreadsheets`: Full access to spreadsheet content (needed for your use case)

This is the standard approach for applications that need to work with user's existing spreadsheets.

## Next Steps

1. ✅ **Update Google Cloud Console scopes** (follow steps above)
2. ✅ **Re-authorize your Google connection** in the app
3. ✅ **Test with the script**: `node test-google-scopes.js`
4. ✅ **Verify spreadsheet listing works** in your app

The code changes are already in place, so once you update the Google Cloud Console configuration and re-authorize, everything should work perfectly!