// Simple test to check Google API connectivity
const axios = require('axios');

async function testGoogleAPI() {
  console.log('Testing Google API connectivity...');
  
  try {
    // Test basic connectivity to Google APIs
    const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': 'Bearer invalid_token_test'
      },
      timeout: 10000
    });
    
    console.log('Unexpected success with invalid token');
  } catch (error) {
    if (error.response) {
      console.log('✅ Google API is reachable');
      console.log('Status:', error.response.status);
      console.log('Expected error for invalid token:', error.response.status === 401);
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot reach Google APIs - network issue');
      console.log('Error:', error.message);
    } else {
      console.log('❌ Other error:', error.message);
    }
  }

  // Test Sheets API endpoint specifically
  try {
    console.log('\nTesting Sheets API endpoint...');
    const response = await axios.post('https://www.googleapis.com/sheets/v4/spreadsheets', {
      properties: { title: 'Test' }
    }, {
      headers: {
        'Authorization': 'Bearer invalid_token_test',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('Unexpected success with invalid token');
  } catch (error) {
    if (error.response) {
      console.log('✅ Sheets API endpoint is reachable');
      console.log('Status:', error.response.status);
      console.log('Expected error for invalid token:', error.response.status === 401);
      
      if (error.response.status === 404) {
        console.log('❌ 404 error - this suggests the endpoint is wrong or not accessible');
        console.log('Response data:', error.response.data);
      }
    } else {
      console.log('❌ Cannot reach Sheets API:', error.message);
    }
  }
}

testGoogleAPI();