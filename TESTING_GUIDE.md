# Platform Connection Testing Guide

## Overview
This guide explains how to test the platform connection management system, including OAuth2 integrations with Youcan Shop and Google Sheets.

## Prerequisites

### 1. Environment Setup
Ensure your environment variables are configured:

```bash
# Backend (.env)
DATABASE_URL="postgresql://..."
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-jwt-secret"
OAUTH2_ENCRYPTION_KEY="your-encryption-key"

# OAuth2 Configuration
YOUCAN_CLIENT_ID="your-youcan-client-id"
YOUCAN_CLIENT_SECRET="your-youcan-client-secret"
YOUCAN_REDIRECT_URI="http://localhost:3000/auth/oauth2-callback"

GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/oauth2-callback"

# Frontend (.env.local)
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### 2. OAuth2 Provider Configuration

#### Youcan Shop Setup
1. Go to Youcan Partners Dashboard
2. Create a new app or edit existing app
3. **IMPORTANT**: Add these redirect URLs:
   - `http://localhost:3000/auth/oauth2-callback` (for local testing)
   - `https://yourdomain.com/auth/oauth2-callback` (for production)
4. Configure required scopes:
   - `read_orders`
   - `write_orders`
   - `read_products`
   - `read_customers`

#### Google OAuth2 Setup
1. Go to Google Cloud Console
2. Enable Google Sheets API
3. Create OAuth2 credentials
4. **IMPORTANT**: Add these authorized redirect URIs:
   - `http://localhost:3000/auth/oauth2-callback` (for local testing)
   - `https://yourdomain.com/auth/oauth2-callback` (for production)
5. Configure scopes:
   - `https://www.googleapis.com/auth/spreadsheets.readonly`

## Testing Steps

### 1. Start the Development Environment

```bash
# Terminal 1: Start the API server
cd apps/api
npm run dev

# Terminal 2: Start the web app
cd apps/web
npm run dev
```

### 2. Access the Platform Connections Page

1. Navigate to `http://localhost:3000/auth/login`
2. Login with admin credentials
3. Go to `http://localhost:3000/dashboard/platform-connections`

### 3. Test Connection Creation

#### Test Youcan Shop Connection
1. Click "Add Connection"
2. Select "Youcan Shop"
3. Enter connection name: "My Test Youcan Store"
4. Click "Connect to Youcan Shop"
5. You should be redirected to Youcan OAuth page
6. After authorization, you'll return to the callback page
7. Verify the connection appears in the list

#### Test Google Sheets Connection
1. Click "Add Connection"
2. Select "Google Sheets"
3. Enter connection name: "My Test Sheet"
4. Click "Connect to Google Sheets"
5. You should be redirected to Google OAuth page
6. After authorization, you'll return to the callback page
7. Verify the connection appears in the list

### 4. Test Connection Management

#### Test Connection Health Check
1. Find an active connection
2. Click the test tube icon (🧪)
3. Verify the test result appears
4. Check that connection status updates if needed

#### Test Token Refresh
1. Find a connection with expired or soon-to-expire token
2. Click the refresh icon (🔄)
3. Verify the token expiration time updates

#### Test Connection Revocation
1. Find any connection
2. Click the delete icon (🗑️)
3. Confirm the deletion
4. Verify the connection status changes to "REVOKED"

## Common Issues and Solutions

### Issue 1: OAuth2 Redirect URL Mismatch

**Symptoms:**
- "Access blocked: This app's request is invalid" (Google)
- "404 Not Found" after OAuth authorization (Youcan)

**Solution:**
1. Check that redirect URLs in OAuth provider match exactly:
   - Local: `http://localhost:3000/auth/oauth2-callback`
   - Production: `https://yourdomain.com/auth/oauth2-callback`
2. Ensure no trailing slashes
3. Use HTTP for localhost, HTTPS for production

### Issue 2: Missing OAuth2 Configuration

**Symptoms:**
- "OAuth2 not configured for platform" error
- Connection initiation fails

**Solution:**
Check OAuth2 configuration service:

```typescript
// apps/api/src/modules/auth/services/oauth2-config.service.ts
@Injectable()
export class OAuth2ConfigService {
  async getConfig(platformType: PlatformType): Promise<OAuth2Config | null> {
    switch (platformType) {
      case PlatformType.YOUCAN:
        return {
          clientId: this.configService.get('YOUCAN_CLIENT_ID'),
          clientSecret: this.configService.get('YOUCAN_CLIENT_SECRET'),
          redirectUri: this.configService.get('YOUCAN_REDIRECT_URI'),
          authorizationUrl: 'https://youcan.shop/oauth/authorize',
          tokenUrl: 'https://youcan.shop/oauth/token',
          scopes: ['read_orders', 'write_orders'],
          usePKCE: true,
        };
      
      case PlatformType.GOOGLE_SHEETS:
        return {
          clientId: this.configService.get('GOOGLE_CLIENT_ID'),
          clientSecret: this.configService.get('GOOGLE_CLIENT_SECRET'),
          redirectUri: this.configService.get('GOOGLE_REDIRECT_URI'),
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
          usePKCE: true,
        };
      
      default:
        return null;
    }
  }
}
```

### Issue 3: CORS Issues

**Symptoms:**
- Network errors during OAuth flow
- "Access-Control-Allow-Origin" errors

**Solution:**
Configure CORS in your API:

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

## Manual Testing Checklist

### Frontend Components
- [ ] Platform connections page loads
- [ ] Add connection dialog opens
- [ ] Platform selection works
- [ ] Connection form validation works
- [ ] OAuth2 redirect initiates correctly
- [ ] Callback page handles success/error states
- [ ] Connection list displays correctly
- [ ] Connection actions (test, refresh, delete) work
- [ ] Status indicators show correct states
- [ ] Pagination works with multiple connections

### Backend API
- [ ] `GET /auth/oauth2/connections` returns connections
- [ ] `POST /auth/oauth2/initiate` generates auth URL
- [ ] `POST /auth/oauth2/complete` handles callback
- [ ] `POST /auth/oauth2/connections/:id/test` tests connection
- [ ] `POST /auth/oauth2/connections/:id/refresh` refreshes tokens
- [ ] `DELETE /auth/oauth2/connections/:id` revokes connection
- [ ] Error handling works for invalid requests
- [ ] Rate limiting prevents abuse
- [ ] Audit logging tracks all operations

### Database
- [ ] PlatformConnection records are created correctly
- [ ] Token encryption/decryption works
- [ ] Status updates persist correctly
- [ ] Audit logs are created for all operations

## Automated Testing

### Run Unit Tests
```bash
# Backend tests
cd apps/api
npm run test

# Frontend tests
cd apps/web
npm run test
```

### Run Integration Tests
```bash
# Backend integration tests
cd apps/api
npm run test:e2e

# Specific platform connection tests
npm run test -- --testNamePattern="Platform Connection"
```

## Debugging Tips

### Enable Debug Logging
```bash
# Backend
DEBUG=oauth2:* npm run dev

# Check logs for OAuth2 operations
tail -f logs/oauth2.log
```

### Check Redis State
```bash
# Connect to Redis
redis-cli

# Check OAuth2 state data
KEYS oauth2:*
GET oauth2:state:your-state-value
```

### Inspect Database
```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Check platform connections
SELECT id, platform_type, platform_name, status, created_at FROM "PlatformConnection";

# Check audit logs
SELECT * FROM "AuditLog" WHERE entity_type = 'PlatformConnection' ORDER BY created_at DESC LIMIT 10;
```

## Production Deployment Considerations

### Environment Variables
- Use secure, randomly generated secrets
- Configure proper redirect URLs for your domain
- Enable HTTPS for all OAuth2 flows

### Security
- Implement rate limiting for OAuth2 endpoints
- Monitor for suspicious OAuth2 activity
- Regularly rotate OAuth2 client secrets
- Use secure token storage with proper encryption

### Monitoring
- Set up alerts for failed OAuth2 flows
- Monitor connection health and token expiration
- Track OAuth2 usage patterns
- Log all security-relevant events

## Troubleshooting OAuth2 Flows

### Debug OAuth2 State Issues
```typescript
// Check state validation in OAuth2Service
private async validateState(state: string): Promise<any> {
  const stateData = await this.redisService.get(`oauth2:state:${state}`);
  
  if (!stateData) {
    this.logger.error('State not found in Redis', { state });
    throw new UnauthorizedException('Invalid or expired state parameter');
  }
  
  // Add debug logging
  this.logger.debug('State validation successful', { 
    state, 
    stateData,
    age: Date.now() - stateData.timestamp 
  });
  
  return stateData;
}
```

### Debug Token Exchange
```typescript
// Add logging to token exchange
const response = await this.httpClient.post(config.tokenUrl, tokenParams);

this.logger.debug('Token exchange response', {
  status: response.status,
  hasAccessToken: !!response.data.access_token,
  hasRefreshToken: !!response.data.refresh_token,
  expiresIn: response.data.expires_in,
});
```

This guide should help you properly test and debug the platform connection system. The key issue you're facing is the redirect URL configuration - make sure they match exactly in both your OAuth2 providers and your application configuration.