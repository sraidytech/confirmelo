#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Documentation Accuracy Against Implementation...\n');

// Read controller files to extract actual endpoints
const controllersDir = path.join(__dirname, '..', 'src', 'modules');

function extractEndpointsFromController(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const endpoints = [];
    
    // Extract controller base path
    const controllerMatch = content.match(/@Controller\(['"`]([^'"`]+)['"`]\)/);
    const basePath = controllerMatch ? controllerMatch[1] : '';
    
    // Extract HTTP methods and paths
    const methodMatches = content.matchAll(/@(Get|Post|Put|Delete|Patch)\((?:['"`]([^'"`]*)['"`])?\)/g);
    
    for (const match of methodMatches) {
      const method = match[1].toUpperCase();
      const path = match[2] || '';
      const fullPath = `/${basePath}${path ? '/' + path : ''}`.replace(/\/+/g, '/');
      endpoints.push({ method, path: fullPath });
    }
    
    return endpoints;
  } catch (error) {
    console.warn(`⚠️  Could not read controller file: ${filePath}`);
    return [];
  }
}

function findControllerFiles(dir) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findControllerFiles(fullPath));
      } else if (item.endsWith('.controller.ts')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory might not exist or be accessible
  }
  
  return files;
}

// Find all controller files
const controllerFiles = findControllerFiles(controllersDir);
console.log(`📁 Found ${controllerFiles.length} controller files`);

// Extract all endpoints
const allEndpoints = [];
for (const file of controllerFiles) {
  const endpoints = extractEndpointsFromController(file);
  allEndpoints.push(...endpoints);
  console.log(`📄 ${path.basename(file)}: ${endpoints.length} endpoints`);
}

console.log(`\n📊 Total endpoints found in implementation: ${allEndpoints.length}`);

// Read OpenAPI documentation
const openApiPath = path.join(__dirname, 'openapi.yaml');
let documentedEndpoints = 0;

try {
  const openApiContent = fs.readFileSync(openApiPath, 'utf8');
  
  // Count documented paths
  const pathMatches = openApiContent.match(/^  \/[^:]+:/gm) || [];
  documentedEndpoints = pathMatches.length;
  
  console.log(`📊 Total endpoints documented in OpenAPI: ${documentedEndpoints}`);
  
  // Check for common endpoints
  const commonEndpoints = [
    'GET /auth/health',
    'POST /auth/register', 
    'POST /auth/login',
    'POST /auth/refresh',
    'GET /auth/me',
    'POST /auth/logout',
    'GET /auth/sessions',
    'GET /users/profile',
    'PUT /users/profile',
    'POST /users/change-password',
    'GET /admin/users',
    'POST /admin/users',
    'GET /admin/teams',
    'POST /admin/teams'
  ];
  
  console.log('\n🔍 Checking key endpoints documentation:');
  for (const endpoint of commonEndpoints) {
    const [method, path] = endpoint.split(' ');
    const pathPattern = path.replace(/\{[^}]+\}/g, '{id}'); // Normalize path params
    
    if (openApiContent.includes(path + ':') || openApiContent.includes(pathPattern + ':')) {
      console.log(`✅ ${endpoint} - Documented`);
    } else {
      console.log(`❌ ${endpoint} - Missing from documentation`);
    }
  }
  
} catch (error) {
  console.error('❌ Could not read OpenAPI documentation:', error.message);
}

// Check markdown documentation
const markdownPath = path.join(__dirname, 'api-documentation.md');
try {
  const markdownContent = fs.readFileSync(markdownPath, 'utf8');
  
  // Count sections
  const sectionMatches = markdownContent.match(/^##[^#]/gm) || [];
  console.log(`\n📖 Markdown documentation sections: ${sectionMatches.length}`);
  
  // Check for key sections
  const requiredSections = [
    'Authentication Endpoints',
    'Session Management',
    'User Profile Management',
    'Admin User Management',
    'Error Codes',
    'Integration Examples'
  ];
  
  console.log('\n🔍 Checking documentation sections:');
  for (const section of requiredSections) {
    if (markdownContent.includes(section)) {
      console.log(`✅ ${section} - Present`);
    } else {
      console.log(`❌ ${section} - Missing`);
    }
  }
  
} catch (error) {
  console.error('❌ Could not read markdown documentation:', error.message);
}

// Summary
console.log('\n📋 Documentation Accuracy Summary:');
console.log(`📊 Implementation endpoints: ${allEndpoints.length}`);
console.log(`📊 Documented endpoints: ${documentedEndpoints}`);

if (documentedEndpoints >= allEndpoints.length * 0.8) {
  console.log('✅ Documentation coverage appears adequate (80%+ coverage)');
} else {
  console.log('⚠️  Documentation may be incomplete (less than 80% coverage)');
}

console.log('\n🎉 Documentation accuracy check completed!');
console.log('\n💡 Note: This is a basic check. Manual review is recommended for complete accuracy.');