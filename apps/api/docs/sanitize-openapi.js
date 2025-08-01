#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the OpenAPI file
const openApiPath = path.join(__dirname, 'openapi.yaml');
let content = fs.readFileSync(openApiPath, 'utf8');

// Define sensitive patterns and their replacements
const sensitivePatterns = [
  // Email addresses
  { pattern: /admin@acme\.com/g, replacement: '[ADMIN_EMAIL]' },
  { pattern: /user@example\.com/g, replacement: '[USER_EMAIL]' },
  { pattern: /newuser@example\.com/g, replacement: '[NEW_USER_EMAIL]' },
  { pattern: /john@example\.com/g, replacement: '[USER_EMAIL]' },
  
  // Passwords
  { pattern: /SecurePassword123!/g, replacement: '[SECURE_PASSWORD]' },
  { pattern: /OldPassword123!/g, replacement: '[OLD_PASSWORD]' },
  { pattern: /NewSecurePassword123!/g, replacement: '[NEW_PASSWORD]' },
  
  // JWT Tokens
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.\.\./g, replacement: '[JWT_TOKEN]' },
  
  // IP Addresses
  { pattern: /192\.168\.1\.100/g, replacement: '[IP_ADDRESS]' },
  { pattern: /127\.0\.0\.1/g, replacement: '[IP_ADDRESS]' },
  
  // Session tokens
  { pattern: /session_1642248600_abc123def/g, replacement: '[SESSION_TOKEN]' },
  { pattern: /reset_token_123456789/g, replacement: '[RESET_TOKEN]' },
  
  // Phone numbers (keep generic format but remove specific numbers)
  { pattern: /\+1234567890/g, replacement: '[PHONE_NUMBER]' },
  
  // User agents (keep generic but remove specific versions)
  { pattern: /Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36/g, replacement: '[USER_AGENT]' },
  { pattern: /Mozilla\/5\.0\.\.\./g, replacement: '[USER_AGENT]' },
  
  // Correlation IDs
  { pattern: /req_123456789/g, replacement: '[CORRELATION_ID]' },
  
  // Notification IDs
  { pattern: /notif_123456789/g, replacement: '[NOTIFICATION_ID]' },
  { pattern: /notif_987654321/g, replacement: '[NOTIFICATION_ID]' },
  
  // Avatar URLs
  { pattern: /https:\/\/example\.com\/avatar\.jpg/g, replacement: '[AVATAR_URL]' },
  { pattern: /https:\/\/example\.com\/new-avatar\.jpg/g, replacement: '[AVATAR_URL]' },
  
  // Generic example URLs
  { pattern: /https:\/\/acme\.com/g, replacement: '[WEBSITE_URL]' },
  { pattern: /https:\/\/example\.com\/avatar\.jpg/g, replacement: '[AVATAR_URL]' },
  
  // Tax IDs
  { pattern: /TAX123456/g, replacement: '[TAX_ID]' },
  
  // Organization names (keep some generic but remove specific company names)
  { pattern: /Acme Corporation/g, replacement: '[ORGANIZATION_NAME]' },
  
  // Specific usernames
  { pattern: /johndoe/g, replacement: '[USERNAME]' },
  { pattern: /newuser/g, replacement: '[USERNAME]' },
  { pattern: /admin/g, replacement: '[ADMIN_USERNAME]' },
  
  // Real names in examples
  { pattern: /John Doe/g, replacement: '[FULL_NAME]' },
  { pattern: /Jane Smith/g, replacement: '[FULL_NAME]' },
  
  // Location names (keep generic)
  { pattern: /Casablanca/g, replacement: '[CITY]' },
  { pattern: /Morocco/g, replacement: '[COUNTRY]' },
  { pattern: /Rabat/g, replacement: '[CITY]' },
  
  // Specific addresses
  { pattern: /123 Business St/g, replacement: '[ADDRESS]' },
  { pattern: /Business City/g, replacement: '[CITY]' },
];

// Apply all replacements
sensitivePatterns.forEach(({ pattern, replacement }) => {
  content = content.replace(pattern, replacement);
});

// Write the sanitized content back
fs.writeFileSync(openApiPath, content, 'utf8');

console.log('OpenAPI documentation sanitized successfully!');
console.log('Removed sensitive information including:');
console.log('- Email addresses');
console.log('- Passwords');
console.log('- JWT tokens');
console.log('- IP addresses');
console.log('- Session tokens');
console.log('- Phone numbers');
console.log('- User agents');
console.log('- Real names and addresses');
console.log('- Organization details');