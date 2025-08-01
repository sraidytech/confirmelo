# OAuth2 Environment Variables Configuration

This document outlines the environment variables required for OAuth2 integration with external platforms.

## Required Environment Variables

### General OAuth2 Configuration

```bash
# OAuth2 token encryption key (used to encrypt stored tokens)
OAUTH2_ENCRYPTION_KEY=your-secure-encryption-key-here

# If not provided, JWT_SECRET will be used as fallback
JWT_SECRET=your-jwt-secret-key
```

### Youcan Shop Integration

```bash
# Youcan OAuth2 Application Credentials
YOUCAN_CLIENT_ID=your-youcan-client-id
YOUCAN_CLIENT_SECRET=your-youcan-client-secret
YOUCAN_REDIRECT_URI=https://your-domain.com/auth/oauth2/youcan/callback

# Example values for development
YOUCAN_CLIENT_ID=youcan_dev_client_123
YOUCAN_CLIENT_SECRET=youcan_dev_secret_456
YOUCAN_REDIRECT_URI=http://localhost:3000/auth/oauth2/youcan/callback
```

### Google Sheets Integration

```bash
# Google OAuth2 Application Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/oauth2/google/callback

# Example values for development
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth2/google/callback
```

### Shopify Integration

```bash
# Shopify OAuth2 Application Credentials
SHOPIFY_CLIENT_ID=your-shopify-client-id
SHOPIFY_CLIENT_SECRET=your-shopify-client-secret
SHOPIFY_REDIRECT_URI=https://your-domain.com/auth/oauth2/shopify/callback

# Example values for development
SHOPIFY_CLIENT_ID=your_shopify_client_id_here
SHOPIFY_CLIENT_SECRET=your_shopify_client_secret_here
SHOPIFY_REDIRECT_URI=http://localhost:3000/auth/oauth2/shopify/callback
```

## Environment File Examples

### Development (.env.development)

```bash
# OAuth2 Configuration
OAUTH2_ENCRYPTION_KEY=dev-oauth2-encryption-key-change-in-production
JWT_SECRET=dev-jwt-secret-key-change-in-production

# Youcan Shop (Development)
YOUCAN_CLIENT_ID=youcan_dev_client_123
YOUCAN_CLIENT_SECRET=youcan_dev_secret_456
YOUCAN_REDIRECT_URI=http://localhost:3000/auth/oauth2/youcan/callback

# Google Sheets (Development)
GOOGLE_CLIENT_ID=123456789-dev.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-dev-secret-key
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth2/google/callback

# Shopify (Development)
SHOPIFY_CLIENT_ID=dev_shopify_client_id
SHOPIFY_CLIENT_SECRET=shpss_dev_secret_key
SHOPIFY_REDIRECT_URI=http://localhost:3000/auth/oauth2/shopify/callback
```

### Production (.env.production)

```bash
# OAuth2 Configuration
OAUTH2_ENCRYPTION_KEY=prod-secure-encryption-key-32-chars-min
JWT_SECRET=prod-secure-jwt-secret-key-32-chars-min

# Youcan Shop (Production)
YOUCAN_CLIENT_ID=youcan_prod_client_xyz
YOUCAN_CLIENT_SECRET=youcan_prod_secret_abc
YOUCAN_REDIRECT_URI=https://app.confirmelo.com/auth/oauth2/youcan/callback

# Google Sheets (Production)
GOOGLE_CLIENT_ID=987654321-prod.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-prod-secret-key
GOOGLE_REDIRECT_URI=https://app.confirmelo.com/auth/oauth2/google/callback

# Shopify (Production)
SHOPIFY_CLIENT_ID=prod_shopify_client_id
SHOPIFY_CLIENT_SECRET=shpss_prod_secret_key
SHOPIFY_REDIRECT_URI=https://app.confirmelo.com/auth/oauth2/shopify/callback
```

## Platform-Specific Setup Instructions

### Youcan Shop

1. **Create OAuth2 Application**:
   - Log in to your Youcan Partner Dashboard
   - Navigate to "Apps" > "Create New App"
   - Fill in app details and set redirect URI
   - Copy Client ID and Client Secret

2. **Required Scopes**:
   - `read_orders`: Read order information
   - `write_orders`: Modify order information
   - `read_products`: Read product catalog
   - `write_products`: Modify product information
   - `read_customers`: Read customer information
   - `write_customers`: Modify customer information

3. **Redirect URI Format**:
   - Development: `http://localhost:3000/auth/oauth2/youcan/callback`
   - Production: `https://your-domain.com/auth/oauth2/youcan/callback`

### Google Sheets

1. **Create OAuth2 Application**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google Sheets API and Google Drive API
   - Go to "Credentials" > "Create Credentials" > "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add authorized redirect URIs

2. **Required Scopes**:
   - `https://www.googleapis.com/auth/spreadsheets`: Full access to Google Sheets
   - `https://www.googleapis.com/auth/drive.readonly`: Read access to Google Drive

3. **Redirect URI Format**:
   - Development: `http://localhost:3000/auth/oauth2/google/callback`
   - Production: `https://your-domain.com/auth/oauth2/google/callback`

### Shopify

1. **Create OAuth2 Application**:
   - Log in to Shopify Partners Dashboard
   - Create a new app or select existing one
   - Set up OAuth2 configuration in app settings
   - Configure redirect URIs and scopes

2. **Required Scopes**:
   - `read_orders`: Read order information
   - `write_orders`: Modify order information
   - `read_products`: Read product catalog
   - `write_products`: Modify product information
   - `read_customers`: Read customer information
   - `write_customers`: Modify customer information

3. **Redirect URI Format**:
   - Development: `http://localhost:3000/auth/oauth2/shopify/callback`
   - Production: `https://your-domain.com/auth/oauth2/shopify/callback`

## Security Considerations

### Encryption Key Requirements

- **Minimum Length**: 32 characters
- **Randomness**: Use cryptographically secure random generation
- **Storage**: Store securely, never commit to version control
- **Rotation**: Plan for periodic key rotation

### Client Secret Security

- **Never expose** client secrets in frontend code
- **Use environment variables** for all sensitive credentials
- **Implement proper access controls** for environment files
- **Monitor for secret leaks** in logs and error messages

### Redirect URI Security

- **Use HTTPS** in production environments
- **Validate redirect URIs** strictly on the platform side
- **Avoid wildcard** redirect URIs
- **Use specific paths** rather than root domains

## Testing Configuration

### Verify Environment Variables

```bash
# Check if all required variables are set
node -e "
const required = [
  'OAUTH2_ENCRYPTION_KEY',
  'YOUCAN_CLIENT_ID', 'YOUCAN_CLIENT_SECRET', 'YOUCAN_REDIRECT_URI',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
  'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_REDIRECT_URI'
];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.log('Missing environment variables:', missing);
  process.exit(1);
} else {
  console.log('All OAuth2 environment variables are set');
}
"
```

### Test OAuth2 Configuration

Use the API endpoint to check which platforms are properly configured:

```bash
# Get available platforms
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/auth/oauth2/platforms
```

## Troubleshooting

### Common Issues

1. **"Platform not configured" Error**:
   - Check if all required environment variables are set
   - Verify variable names match exactly (case-sensitive)
   - Restart the application after adding variables

2. **"Invalid redirect URI" Error**:
   - Ensure redirect URI in environment matches platform configuration
   - Check for trailing slashes or protocol mismatches
   - Verify domain is accessible from the platform

3. **"Invalid client credentials" Error**:
   - Double-check client ID and secret values
   - Ensure credentials are for the correct environment (dev/prod)
   - Verify the OAuth2 app is active on the platform

4. **Token encryption/decryption errors**:
   - Ensure OAUTH2_ENCRYPTION_KEY is set and consistent
   - Check key length (minimum 32 characters recommended)
   - Verify the same key is used across all application instances

### Debug Mode

Enable debug logging for OAuth2 operations:

```bash
# Add to environment variables
DEBUG=oauth2:*
LOG_LEVEL=debug
```

This will provide detailed logs for OAuth2 flows, token exchanges, and API calls.