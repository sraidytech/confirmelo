#!/usr/bin/env node

/**
 * OAuth2 Configuration Diagnostic Script
 * 
 * This script checks if your OAuth2 configuration is set up correctly
 * Run with: node scripts/check-oauth2-config.js
 */

require('dotenv').config();

const requiredEnvVars = {
  'Database': ['DATABASE_URL'],
  'Redis': ['REDIS_URL'],
  'JWT': ['JWT_SECRET'],
  'OAuth2 Encryption': ['OAUTH2_ENCRYPTION_KEY'],
  'Youcan Shop': ['YOUCAN_CLIENT_ID', 'YOUCAN_CLIENT_SECRET', 'YOUCAN_REDIRECT_URI'],
  'Google OAuth2': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
};

const optionalEnvVars = {
  'Shopify': ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SHOPIFY_REDIRECT_URI'],
};

console.log('🔍 OAuth2 Configuration Diagnostic\n');

// Check required environment variables
let allRequiredPresent = true;
for (const [category, vars] of Object.entries(requiredEnvVars)) {
  console.log(`📋 ${category}:`);
  for (const varName of vars) {
    const value = process.env[varName];
    if (value) {
      // Mask sensitive values
      const maskedValue = ['SECRET', 'KEY'].some(keyword => varName.includes(keyword))
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : value;
      console.log(`  ✅ ${varName}: ${maskedValue}`);
    } else {
      console.log(`  ❌ ${varName}: NOT SET`);
      allRequiredPresent = false;
    }
  }
  console.log();
}

// Check optional environment variables
console.log('📋 Optional Configurations:');
for (const [category, vars] of Object.entries(optionalEnvVars)) {
  console.log(`  ${category}:`);
  let categoryConfigured = true;
  for (const varName of vars) {
    const value = process.env[varName];
    if (value) {
      const maskedValue = ['SECRET', 'KEY'].some(keyword => varName.includes(keyword))
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : value;
      console.log(`    ✅ ${varName}: ${maskedValue}`);
    } else {
      console.log(`    ⚠️  ${varName}: NOT SET`);
      categoryConfigured = false;
    }
  }
  if (categoryConfigured) {
    console.log(`    ✅ ${category} is fully configured`);
  } else {
    console.log(`    ⚠️  ${category} is partially configured`);
  }
  console.log();
}

// Validate redirect URIs
console.log('🔗 Redirect URI Validation:');
const redirectUris = [
  { name: 'Youcan', uri: process.env.YOUCAN_REDIRECT_URI },
  { name: 'Google', uri: process.env.GOOGLE_REDIRECT_URI },
  { name: 'Shopify', uri: process.env.SHOPIFY_REDIRECT_URI },
];

for (const { name, uri } of redirectUris) {
  if (uri) {
    console.log(`  ${name}: ${uri}`);
    
    // Validate URI format
    try {
      const url = new URL(uri);
      const issues = [];
      
      // Check protocol
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        issues.push('Invalid protocol (should be http: or https:)');
      }
      
      // Check for localhost with https
      if (url.hostname === 'localhost' && url.protocol === 'https:') {
        issues.push('Use http: for localhost, not https:');
      }
      
      // Check path
      if (url.pathname !== '/auth/oauth2-callback') {
        issues.push('Path should be /auth/oauth2-callback');
      }
      
      // Check for trailing slash
      if (url.pathname.endsWith('/') && url.pathname !== '/') {
        issues.push('Remove trailing slash from path');
      }
      
      if (issues.length === 0) {
        console.log(`    ✅ URI format is valid`);
      } else {
        console.log(`    ❌ Issues found:`);
        issues.forEach(issue => console.log(`      - ${issue}`));
      }
    } catch (error) {
      console.log(`    ❌ Invalid URI format: ${error.message}`);
    }
  }
  console.log();
}

// Summary
console.log('📊 Summary:');
if (allRequiredPresent) {
  console.log('✅ All required environment variables are configured');
} else {
  console.log('❌ Some required environment variables are missing');
  console.log('   Please check your .env file and ensure all required variables are set');
}

console.log('\n🚀 Next Steps:');
console.log('1. Fix any missing or invalid environment variables');
console.log('2. Ensure your OAuth2 providers have the correct redirect URIs configured');
console.log('3. Start your development servers:');
console.log('   - API: npm run dev (in apps/api)');
console.log('   - Web: npm run dev (in apps/web)');
console.log('4. Test the OAuth2 flow at http://localhost:3000/dashboard/platform-connections');

console.log('\n📚 For detailed setup instructions, see:');
console.log('   - OAUTH2_SETUP.md');
console.log('   - TESTING_GUIDE.md');