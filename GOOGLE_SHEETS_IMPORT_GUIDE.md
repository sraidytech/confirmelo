# Google Sheets Import Guide

## Issue
After connecting your Google account, you see "No spreadsheets found" even though you have existing spreadsheets in your Google Drive.

## Why This Happens
With the `drive.file` OAuth2 scope (which we use for security), your app can only see:
- ✅ Spreadsheets created by the app itself
- ✅ Spreadsheets explicitly imported/opened through the app
- ❌ Existing spreadsheets in your Google Drive (for security reasons)

## Solution: Import Your Existing Spreadsheets

### Method 1: Using the Import Button (Recommended)

1. **Open the Spreadsheet Selector**
   - When you see "No spreadsheets found", click the **"Import"** button
   - Or click **"Import Existing Spreadsheet"** in the empty state

2. **Get Your Spreadsheet URL**
   - Open your Google Sheets document in a new tab
   - Copy the URL from the address bar (it looks like this):
     ```
     https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
     ```

3. **Import the Spreadsheet**
   - Paste the URL into the import dialog
   - Click **"Import"**
   - The spreadsheet will now appear in your list!

### Method 2: Share the Spreadsheet

Alternatively, you can make your spreadsheet accessible by:

1. **Open your Google Sheets document**
2. **Click "Share" in the top-right corner**
3. **Change access to "Anyone with the link can view"**
4. **Refresh the spreadsheet selector in your app**

## Important Notes

### ✅ What Works
- Importing spreadsheets by URL/ID
- Creating new spreadsheets through the app
- Accessing previously imported spreadsheets
- Full read/write access to imported spreadsheets

### ⚠️ Limitations
- Cannot automatically see all your existing spreadsheets
- Need to import each spreadsheet you want to use
- Spreadsheet must be accessible to your Google account

### 🔒 Security Benefits
- Your app only accesses spreadsheets you explicitly allow
- No broad access to your entire Google Drive
- Complies with Google's security best practices
- Faster OAuth2 approval process

## Troubleshooting

### "Cannot access spreadsheet" Error
**Cause:** The spreadsheet is not shared with your Google account or is private.

**Solutions:**
1. Make sure you're signed in with the same Google account
2. Share the spreadsheet with your Google account
3. Make the spreadsheet publicly accessible (view permissions)

### "Invalid Google Sheets URL" Error
**Cause:** The URL format is not recognized.

**Solutions:**
1. Copy the full URL from your browser's address bar
2. Make sure it's a Google Sheets URL (contains `docs.google.com/spreadsheets`)
3. You can also use just the spreadsheet ID (the long string in the URL)

### Import Button Not Visible
**Cause:** You might not have the right permissions.

**Solutions:**
1. Make sure you're logged in as an Admin or Team Leader
2. Check that your Google Sheets connection is active
3. Refresh the page and try again

## Example URLs That Work

✅ **Full URL:**
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
```

✅ **Just the ID:**
```
1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
```

✅ **Share URL:**
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing
```

## Need Help?

If you're still having trouble:
1. Check that your Google Sheets connection is active
2. Verify the spreadsheet URL is correct
3. Make sure the spreadsheet is accessible to your Google account
4. Try creating a test spreadsheet through the app first

The import feature makes it easy to work with your existing spreadsheets while maintaining security! 🎉