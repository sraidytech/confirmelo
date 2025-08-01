#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Note: This script assumes js-yaml is available in the project
// If not available, we'll parse YAML manually for basic validation

console.log('🔍 Validating API Documentation...\n');

// Read OpenAPI file
const openApiPath = path.join(__dirname, 'openapi.yaml');
const markdownPath = path.join(__dirname, 'api-documentation.md');

try {
  // Read OpenAPI content
  const openApiContent = fs.readFileSync(openApiPath, 'utf8');
  console.log('✅ OpenAPI file loaded successfully');

  // Check for sensitive information
  const sensitivePatterns = [
    /admin@acme\.com/g,
    /user@example\.com/g,
    /SecurePassword123!/g,
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/g,
    /192\.168\.1\.100/g,
    /\+1234567890/g,
    /session_1642248600_abc123def/g,
  ];

  let foundSensitive = false;
  sensitivePatterns.forEach((pattern, index) => {
    if (pattern.test(openApiContent)) {
      console.log(`❌ Found sensitive information: Pattern ${index + 1}`);
      foundSensitive = true;
    }
  });

  if (!foundSensitive) {
    console.log('✅ No sensitive information found in OpenAPI documentation');
  }

  // Validate required sections by checking content
  const requiredSections = ['info:', 'servers:', 'paths:', 'components:', 'security:'];
  
  requiredSections.forEach(section => {
    if (openApiContent.includes(section)) {
      console.log(`✅ Required section '${section.replace(':', '')}' is present`);
    } else {
      console.log(`❌ Missing required section '${section.replace(':', '')}'`);
    }
  });

  // Count endpoints by counting path definitions
  const pathMatches = openApiContent.match(/^  \/[^:]+:/gm) || [];
  console.log(`📊 Total API endpoints documented: ${pathMatches.length}`);

  // Count schemas by counting schema definitions in components section
  const componentsSection = openApiContent.split('components:')[1];
  if (componentsSection) {
    const schemaMatches = componentsSection.match(/^    [A-Z]\w+:/gm) || [];
    console.log(`📊 Total schemas defined: ${schemaMatches.length}`);
  } else {
    console.log(`📊 Total schemas defined: 0`);
  }

  // Validate markdown documentation exists
  if (fs.existsSync(markdownPath)) {
    console.log('✅ Markdown documentation exists');
    
    const markdownContent = fs.readFileSync(markdownPath, 'utf8');
    
    // Check for sensitive info in markdown
    let foundSensitiveMarkdown = false;
    sensitivePatterns.forEach((pattern, index) => {
      if (pattern.test(markdownContent)) {
        console.log(`❌ Found sensitive information in markdown: Pattern ${index + 1}`);
        foundSensitiveMarkdown = true;
      }
    });

    if (!foundSensitiveMarkdown) {
      console.log('✅ No sensitive information found in markdown documentation');
    }
  } else {
    console.log('❌ Markdown documentation not found');
  }

  console.log('\n🎉 Documentation validation completed!');

} catch (error) {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
}