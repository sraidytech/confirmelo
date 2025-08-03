// Debug script to test Google Sheets API calls
const axios = require('axios');

async function testGoogleSheetsAPI() {
  // You'll need to replace this with an actual access token from your connection
  const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN_HERE';

  const googleApiClient = axios.create({
    baseURL: 'https://www.googleapis.com',
    timeout: 30000,
    headers: {
      'User-Agent': 'Confirmelo-Google-Client/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  try {
    console.log('Testing Google Drive API to list spreadsheets...');

    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      pageSize: '10',
      fields: 'nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink)',
    });

    const response = await googleApiClient.get(
      `/drive/v3/files?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      },
    );

    console.log('Success! Found spreadsheets:', response.data);
    console.log('Number of spreadsheets:', response.data.files?.length || 0);

    if (response.data.files && response.data.files.length > 0) {
      console.log('First spreadsheet:', response.data.files[0]);
    }

  } catch (error) {
    console.error('Error calling Google Drive API:');
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Error Data:', error.response?.data);
    console.error('Error Message:', error.message);

    if (error.response?.status === 403) {
      console.log('\n🚨 This is likely a scope issue!');
      console.log('The current scopes might not include access to list Drive files.');
      console.log('Required scope: https://www.googleapis.com/auth/drive.file');
      console.log('Current scope: https://www.googleapis.com/auth/drive.file (only app-created files)');
    }
  }

  try {
    console.log('\nTesting Google user info...');
    const userResponse = await googleApiClient.get('/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });
    console.log('User info success:', userResponse.data);
  } catch (error) {
    console.error('User info error:', error.response?.data || error.message);
  }
}

// Run the test
testGoogleSheetsAPI();