/**
 * Script to exchange authorization code for access token and refresh token
 * Run: node scripts/get-cliq-tokens.js
 */

const CLIENT_ID = '1000.YV7PVU7CTR66U2O47FH6COESCQW0GW';
const CLIENT_SECRET = '4a44ee98d81688af8a14929962acc1a9e12f8358bc';
const CODE = '1000.60519d14c7cb30a9dcbf7a9cc1c42720.d4dd45c39c209c672680df77a2ea63f2';
const REDIRECT_URI = 'http://localhost';

async function getTokens() {
  console.log('🔄 Exchanging authorization code for tokens...');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code: CODE
  });

  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Failed to get tokens:', error);
    process.exit(1);
  }

  const data = await response.json();

  console.log('\n✅ Success! Tokens received:\n');
  console.log('📋 Copy these to your .env file:\n');
  console.log(`CLIQ_API_TOKEN=${data.access_token}`);
  console.log(`CLIQ_REFRESH_TOKEN=${data.refresh_token}`);
  console.log(`CLIQ_CLIENT_ID=${CLIENT_ID}`);
  console.log(`CLIQ_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log('\n📝 Full response:');
  console.log(JSON.stringify(data, null, 2));
}

getTokens().catch(console.error);
