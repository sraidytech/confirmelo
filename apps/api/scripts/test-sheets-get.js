// Test GET request to Sheets API
const axios = require('axios');

async function testSheetsGET() {
  console.log('Testing Sheets API GET request...');
  
  try {
    // Test GET request to a known spreadsheet (this should return 401 for invalid token)
    const response = await axios.get('https://www.googleapis.com/sheets/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', {
      headers: {
        'Authorization': 'Bearer invalid_token_test'
      },
      timeout: 10000
    });
    
    console.log('Unexpected success with invalid token');
  } catch (error) {
    if (error.response) {
      console.log('Status:', error.response.status);
      if (error.response.status === 401) {
        console.log('✅ Sheets API GET endpoint works (returns 401 for invalid token)');
      } else if (error.response.status === 404) {
        console.log('❌ Sheets API GET returns 404');
        console.log('Response:', error.response.data);
      } else {
        console.log('Other status:', error.response.status);
      }
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
}

testSheetsGET();