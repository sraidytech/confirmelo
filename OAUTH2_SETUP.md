# OAuth2 Setup Guide

## Quick Fix for Your Current Issues

Based on the screenshots you shared, here's how to fix the redirect URL issues:

### 1. Youcan Shop Configuration

**In Youcan Partners Dashboard:**
1. Go to your app's "Overview" section
2. Find "Allowed redirect URLs" field
3. Add exactly: `http://localhost:3000/auth/oauth2-callback`
4. For production, also add: `https://yourdomain.com/auth/oauth2-callback`
5. Save the configuration

**In your backend .env file:**
```bash
YOUCAN_CLIENT_ID="your-client-id-from-youcan"
YOUCAN_CLIENT_SECRET="your-client-secret-from-youcan"
YOUCAN_REDIRECT_URI="http://localhost:3000/auth/oauth2-callback"
```

### 2. Google OAuth2 Configuration

**In Google Cloud Console:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create OAuth2 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3000/auth/oauth2-callback`
     - `https://yourdomain.com/auth/oauth2-callback` (for production)
5. Copy the Client ID and Client Secret

**In your backend .env file:**
```bash
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/oauth2-callback"
```

## Complete Setup Instructions

### Step 1: Environment Configuration

Copy the example files and configure them:

```bash
# Backend
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your actual values

# Frontend
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local with your actual values
```

### Step 2: Database Setup

Make sure your PostgreSQL database is running and the schema is up to date:

```bash
cd apps/api
npx prisma generate
npx prisma db push
```

### Step 3: Start the Services

```bash
# Terminal 1: Start Redis (if not running)
redis-server

# Terminal 2: Start the API
cd apps/api
npm run dev

# Terminal 3: Start the web app
cd apps/web
npm run dev
```

### Step 4: Test the OAuth2 Flow

1. Navigate to `http://localhost:3000/auth/login`
2. Login with your admin credentials
3. Go to `http://localhost:3000/dashboard/platform-connections`
4. Click "Add Connection"
5. Try connecting to Youcan or Google Sheets

## Troubleshooting Common Issues

### Issue: "OAuth2 not configured for platform"

**Solution:** Check your environment variables are loaded correctly:

```bash
# In your API terminal, check if env vars are loaded
cd apps/api
node -e "console.log('YOUCAN_CLIENT_ID:', process.env.YOUCAN_CLIENT_ID)"
node -e "console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID)"
```

### Issue: "Invalid redirect URI"

**Solution:** Ensure exact match between:
1. Your OAuth2 provider configuration
2. Your environment variable
3. The actual callback URL

**Common mistakes:**
- Trailing slashes: `http://localhost:3000/auth/oauth2-callback/` ❌
- Wrong protocol: `https://localhost:3000/auth/oauth2-callback` ❌ (use http for localhost)
- Wrong port: `http://localhost:3001/auth/oauth2-callback` ❌

**Correct format:**
- Local: `http://localhost:3000/auth/oauth2-callback` ✅
- Production: `https://yourdomain.com/auth/oauth2-callback` ✅

### Issue: CORS errors

**Solution:** Make sure your API CORS configuration allows your frontend domain:

```typescript
// apps/api/src/main.ts
app.enableCors({
  origin: [
    'http://localhost:3000',
    'https://yourdomain.com',
  ],
  credentials: true,
});
```

## Testing Your Configuration

### Test 1: Check OAuth2 Config Loading

```bash
# Make a request to check if configs are loaded
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/auth/oauth2/platforms
```

### Test 2: Test OAuth2 Initiation

1. Open browser dev tools
2. Go to platform connections page
3. Try to add a connection
4. Check the network tab for the OAuth2 initiation request
5. Verify the authorization URL is generated correctly

### Test 3: Test OAuth2 Callback

1. Complete an OAuth2 flow
2. Check that you're redirected to `/auth/oauth2-callback`
3. Verify the callback page shows success/error appropriately
4. Check that you're redirected back to platform connections

## Production Deployment

### Environment Variables for Production

```bash
# Production .env
YOUCAN_REDIRECT_URI="https://yourdomain.com/auth/oauth2-callback"
GOOGLE_REDIRECT_URI="https://yourdomain.com/auth/oauth2-callback"
SHOPIFY_REDIRECT_URI="https://yourdomain.com/auth/oauth2-callback"

CORS_ORIGIN="https://yourdomain.com"
```

### OAuth2 Provider Configuration for Production

**Youcan Shop:**
- Add production redirect URI: `https://yourdomain.com/auth/oauth2-callback`

**Google Cloud Console:**
- Add production redirect URI: `https://yourdomain.com/auth/oauth2-callback`
- Update authorized domains if needed

### Security Considerations

1. **Use HTTPS in production** - OAuth2 providers require HTTPS for production apps
2. **Secure your secrets** - Use environment variables, never commit secrets to git
3. **Validate redirect URIs** - Ensure only your domains are allowed
4. **Monitor OAuth2 usage** - Set up logging and monitoring for OAuth2 flows
5. **Rotate secrets regularly** - Change OAuth2 client secrets periodically

## Debug Commands

### Check if OAuth2 services are working:

```bash
# Check if configs are loaded
curl http://localhost:3001/api/health

# Check OAuth2 initiation (requires auth token)
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platformType":"YOUCAN","platformName":"Test Store"}' \
  http://localhost:3001/api/auth/oauth2/initiate
```

### Check database connections:

```bash
# Check if platform connections are stored
cd apps/api
npx prisma studio
# Navigate to PlatformConnection table
```

### Check Redis state:

```bash
# Connect to Redis and check OAuth2 state
redis-cli
KEYS oauth2:*
```

This should resolve the OAuth2 redirect issues you're experiencing. The key is ensuring the redirect URIs match exactly between your OAuth2 providers and your application configuration.