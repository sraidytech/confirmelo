// Test the fixed Sheets API endpoint
const axios = require('axios');

async function testSheetsAPIFix() {
  console.log('Testing fixed Sheets API endpoint...');
  
  try {
    // Test with the correct base URL
    const sheetsClient = axios.create({
      baseURL: 'https://sheets.googleapis.com',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    const response = await sheetsClient.post('/v4/spreadsheets', {
      properties: { title: 'Test' }
    }, {
      headers: {
        'Authorization': 'Bearer invalid_token_test'
      }
    });
    
    console.log('Unexpected success with invalid token');
  } catch (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      if (error.response.status === 401) {
        console.log('✅ Sheets API endpoint works correctly (returns 401 for invalid token)');
      } else if (error.response.status === 404) {
        console.log('❌ Still getting 404 error');
        console.log('Response:', error.response.data);
      } else {
        console.log('Other status:', error.response.status);
      }
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
}

testSheetsAPIFix();