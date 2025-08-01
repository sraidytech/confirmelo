#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the markdown documentation file
const markdownPath = path.join(__dirname, 'api-documentation.md');
let content = fs.readFileSync(markdownPath, 'utf8');

// Define sensitive patterns and their replacements for markdown
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
  { pattern: /password123/g, replacement: '[PASSWORD]' },
  
  // JWT Tokens
  { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.\.\./g, replacement: '[JWT_TOKEN]' },
  
  // IP Addresses
  { pattern: /192\.168\.1\.100/g, replacement: '[IP_ADDRESS]' },
  { pattern: /127\.0\.0\.1/g, replacement: '[IP_ADDRESS]' },
  
  // Session tokens
  { pattern: /session_1642248600_abc123def/g, replacement: '[SESSION_TOKEN]' },
  { pattern: /reset_token_123456789/g, replacement: '[RESET_TOKEN]' },
  
  // Phone numbers
  { pattern: /\+1234567890/g, replacement: '[PHONE_NUMBER]' },
  
  // User agents
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
  
  // Tax IDs
  { pattern: /TAX123456/g, replacement: '[TAX_ID]' },
  
  // Organization names
  { pattern: /Acme Corporation/g, replacement: '[ORGANIZATION_NAME]' },
  
  // Specific usernames
  { pattern: /johndoe/g, replacement: '[USERNAME]' },
  { pattern: /newuser/g, replacement: '[USERNAME]' },
  
  // Real names in examples
  { pattern: /John Doe/g, replacement: '[FULL_NAME]' },
  { pattern: /Jane Smith/g, replacement: '[FULL_NAME]' },
  { pattern: /"John"/g, replacement: '"[FIRST_NAME]"' },
  { pattern: /"Jane"/g, replacement: '"[FIRST_NAME]"' },
  { pattern: /"Doe"/g, replacement: '"[LAST_NAME]"' },
  { pattern: /"Smith"/g, replacement: '"[LAST_NAME]"' },
  
  // Location names
  { pattern: /Casablanca/g, replacement: '[CITY]' },
  { pattern: /Morocco/g, replacement: '[COUNTRY]' },
  { pattern: /Rabat/g, replacement: '[CITY]' },
  
  // Specific addresses
  { pattern: /123 Business St/g, replacement: '[ADDRESS]' },
  { pattern: /Business City/g, replacement: '[CITY]' },
  
  // Store names
  { pattern: /Main Store/g, replacement: '[STORE_NAME]' },
  
  // Team names
  { pattern: /Customer Service Team/g, replacement: '[TEAM_NAME]' },
  { pattern: /New Support Team/g, replacement: '[TEAM_NAME]' },
  { pattern: /Updated Support Team/g, replacement: '[TEAM_NAME]' },
  
  // Generic descriptions
  { pattern: /Handles customer inquiries and support/g, replacement: '[TEAM_DESCRIPTION]' },
  { pattern: /Handles advanced customer support/g, replacement: '[TEAM_DESCRIPTION]' },
  { pattern: /Updated description/g, replacement: '[TEAM_DESCRIPTION]' },
  
  // Policy violations
  { pattern: /Policy violation/g, replacement: '[SUSPENSION_REASON]' },
  
  // Browser and OS info
  { pattern: /Windows/g, replacement: '[OS_NAME]' },
  { pattern: /Chrome/g, replacement: '[BROWSER_NAME]' },
];

// Apply all replacements
sensitivePatterns.forEach(({ pattern, replacement }) => {
  content = content.replace(pattern, replacement);
});

// Write the sanitized content back
fs.writeFileSync(markdownPath, content, 'utf8');

console.log('Markdown documentation sanitized successfully!');
console.log('Removed sensitive information from API documentation.');