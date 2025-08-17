// Test script to verify Google Sheets sync
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

// You'll need to replace these with your actual values
const CONNECTION_ID = 'your-connection-id'; // Get this from the UI
const SPREADSHEET_ID = 'your-spreadsheet-id'; // Get this from the Google Sheets URL
const ACCESS_TOKEN = 'your-access-token'; // Get this from browser dev tools

async function testSyncPipeline() {
  try {
    console.log('🔍 Testing Google Sheets Sync Pipeline...\n');

    // Test 1: Check connection health
    console.log('1. Checking connection health...');
    const healthResponse = await axios.get(
      `${API_BASE}/auth/oauth2/google-sheets/diagnostics/connections/${CONNECTION_ID}/sync-health`,
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
      }
    );
    console.log('✅ Health check result:', healthResponse.data.overall);
    console.log('   Components:', healthResponse.data.checks.map(c => `${c.component}: ${c.status}`).join(', '));

    // Test 2: Run diagnostic test
    console.log('\n2. Running diagnostic test...');
    const diagnosticResponse = await axios.post(
      `${API_BASE}/auth/oauth2/google-sheets/diagnostics/connections/${CONNECTION_ID}/test-sync-pipeline`,
      {
        spreadsheetId: SPREADSHEET_ID,
        bypassQueue: true // Test direct sync first
      },
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
      }
    );

    console.log('✅ Diagnostic test completed');
    console.log(`   Success: ${diagnosticResponse.data.success}`);
    console.log(`   Steps: ${diagnosticResponse.data.summary.successfulSteps}/${diagnosticResponse.data.summary.totalSteps} successful`);
    
    // Show failed steps
    const failedSteps = diagnosticResponse.data.steps.filter(s => s.status === 'failed');
    if (failedSteps.length > 0) {
      console.log('\n❌ Failed steps:');
      failedSteps.forEach(step => {
        console.log(`   - ${step.step}: ${step.error}`);
      });
    }

    // Test 3: Try manual sync
    console.log('\n3. Attempting manual sync...');
    const syncResponse = await axios.post(
      `${API_BASE}/auth/oauth2/google-sheets/connections/${CONNECTION_ID}/order-sheets/${SPREADSHEET_ID}/sync`,
      {},
      {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
      }
    );

    console.log('✅ Manual sync triggered');
    console.log(`   Operation ID: ${syncResponse.data.operationId}`);
    console.log(`   Status: ${syncResponse.data.status}`);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n💡 This might be because:');
      console.log('   - The spreadsheet is not enabled for order sync');
      console.log('   - The connection ID or spreadsheet ID is incorrect');
      console.log('   - The API endpoints are not working');
    }
  }
}

console.log('📋 To run this test:');
console.log('1. Get your connection ID from the Order Sync Manager UI');
console.log('2. Get your spreadsheet ID from the Google Sheets URL');
console.log('3. Get your access token from browser dev tools (Application > Cookies > accessToken)');
console.log('4. Update the variables at the top of this script');
console.log('5. Run: node test-sync.js\n');

// Uncomment the line below after updating the variables
// testSyncPipeline();