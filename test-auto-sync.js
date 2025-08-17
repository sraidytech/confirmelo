/**
 * Test script for auto-sync functionality
 * Run this to test if the auto-sync endpoints are working
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

// You'll need to replace these with actual values from your system
const TEST_CONNECTION_ID = 'your-connection-id';
const TEST_SPREADSHEET_ID = 'your-spreadsheet-id';
const TEST_ACCESS_TOKEN = 'your-access-token'; // Get this from browser cookies

async function testAutoSync() {
  console.log('🧪 Testing Auto-Sync Functionality\n');

  const headers = {
    'Authorization': `Bearer ${TEST_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Test enabling auto-sync
    console.log('1️⃣ Testing auto-sync enable...');
    const enableResponse = await axios.post(
      `${API_BASE_URL}/auth/oauth2/google-sheets/connections/${TEST_CONNECTION_ID}/spreadsheets/${TEST_SPREADSHEET_ID}/auto-sync`,
      {},
      { headers }
    );
    console.log('✅ Auto-sync enable response:', enableResponse.data);

    // 2. Test getting order sheets to verify webhook status
    console.log('\n2️⃣ Testing order sheets list...');
    const sheetsResponse = await axios.get(
      `${API_BASE_URL}/auth/oauth2/google-sheets/connections/${TEST_CONNECTION_ID}/order-sheets`,
      { headers }
    );
    console.log('✅ Order sheets response:', JSON.stringify(sheetsResponse.data, null, 2));

    // 3. Test disabling auto-sync
    console.log('\n3️⃣ Testing auto-sync disable...');
    const disableResponse = await axios.delete(
      `${API_BASE_URL}/auth/oauth2/google-sheets/connections/${TEST_CONNECTION_ID}/spreadsheets/${TEST_SPREADSHEET_ID}/auto-sync`,
      { headers }
    );
    console.log('✅ Auto-sync disable response:', disableResponse.data);

    // 4. Verify webhook was removed
    console.log('\n4️⃣ Verifying webhook removal...');
    const finalSheetsResponse = await axios.get(
      `${API_BASE_URL}/auth/oauth2/google-sheets/connections/${TEST_CONNECTION_ID}/order-sheets`,
      { headers }
    );
    console.log('✅ Final order sheets response:', JSON.stringify(finalSheetsResponse.data, null, 2));

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
}

// Instructions for running the test
if (require.main === module) {
  console.log('📋 To run this test:');
  console.log('1. Update TEST_CONNECTION_ID with your actual connection ID');
  console.log('2. Update TEST_SPREADSHEET_ID with your actual spreadsheet ID');
  console.log('3. Update TEST_ACCESS_TOKEN with your access token from browser cookies');
  console.log('4. Run: node test-auto-sync.js\n');
  
  if (TEST_CONNECTION_ID === 'your-connection-id') {
    console.log('⚠️  Please update the test configuration first!');
  } else {
    testAutoSync();
  }
}

module.exports = { testAutoSync };