/**
 * Cliq Service
 * Handles communication with Zoho Cliq API
 */

const CLIQ_API_BASE = 'https://cliq.zoho.com/api/v2';

// Token cache
let cachedAccessToken = process.env.CLIQ_API_TOKEN;
let tokenExpiresAt = null;

/**
 * Refresh Zoho OAuth token
 */
async function refreshAccessToken() {
  const refreshToken = process.env.CLIQ_REFRESH_TOKEN;
  const clientId = process.env.CLIQ_CLIENT_ID;
  const clientSecret = process.env.CLIQ_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    console.error('❌ Missing Cliq OAuth credentials for token refresh');
    return null;
  }

  try {
    console.log('🔄 Refreshing Cliq access token...');

    const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token refresh failed:', errorText);
      return null;
    }

    const data = await response.json();

    if (data.access_token) {
      cachedAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 300000; // Refresh 5 min before expiry
      console.log('✅ Access token refreshed successfully');
      return cachedAccessToken;
    }

    return null;
  } catch (error) {
    console.error('❌ Failed to refresh token:', error);
    return null;
  }
}

/**
 * Get valid access token (refreshes if needed)
 */
async function getValidAccessToken() {
  // Check if token needs refresh
  if (!tokenExpiresAt || Date.now() >= tokenExpiresAt) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return newToken;
    }
  }

  return cachedAccessToken;
}

/**
 * Send message to Cliq channel or thread
 */
export async function sendCliqMessage({ channelId, message, conversationId, threadId }) {
  const apiToken = await getValidAccessToken();

  if (!apiToken) {
    throw new Error('Cliq API token not configured');
  }

  try {
    const endpoint = threadId
      ? `${CLIQ_API_BASE}/channelsbyname/${channelId}/message/${threadId}`
      : `${CLIQ_API_BASE}/channelsbyname/${channelId}/message`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: message,
        bot_name: process.env.CLIQ_BOT_NAME || 'AI Support Agent'
      })
    });

    if (!response.ok) {
      const errorData = await response.json();

      // If token invalid, try to refresh and retry once
      if (errorData.code === 'oauthtoken_invalid') {
        console.log('🔄 Token invalid, refreshing...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          return sendCliqMessage({ channelId, message, conversationId, threadId });
        }
      }

      throw new Error(`Cliq API error: ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log(`✅ Message sent to Cliq channel ${channelId}`);

    return result;
  } catch (error) {
    console.error('❌ Failed to send Cliq message:', error);
    throw new Error(`Failed to send message: ${error.message}`);
  }
}

/**
 * React to message with emoji
 */
export async function reactToMessage({ channelId, messageId, emoji }) {
  const apiToken = await getValidAccessToken();

  if (!apiToken) {
    throw new Error('Cliq API token not configured');
  }

  try {
    const endpoint = `${CLIQ_API_BASE}/channelsbyname/${channelId}/message/${messageId}/react`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emoji })
    });

    if (!response.ok) {
      const errorData = await response.json();

      // If token invalid, try to refresh and retry once
      if (errorData.code === 'oauthtoken_invalid') {
        console.log('🔄 Token invalid, refreshing...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          return reactToMessage({ channelId, messageId, emoji });
        }
      }

      throw new Error(`Cliq API error: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Failed to react to message:', error);
    throw error;
  }
}

/**
 * Get message details
 */
export async function getMessage({ channelId, messageId }) {
  const apiToken = await getValidAccessToken();

  if (!apiToken) {
    throw new Error('Cliq API token not configured');
  }

  try {
    const endpoint = `${CLIQ_API_BASE}/channelsbyname/${channelId}/message/${messageId}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Zoho-oauthtoken ${apiToken}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();

      // If token invalid, try to refresh and retry once
      if (errorData.code === 'oauthtoken_invalid') {
        console.log('🔄 Token invalid, refreshing...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          return getMessage({ channelId, messageId });
        }
      }

      throw new Error(`Cliq API error: ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Failed to get message:', error);
    throw error;
  }
}

/**
 * Post message to channel via Cliq REST API
 */
export async function postToChannelAPI({ channelId, text }) {
  const apiToken = await getValidAccessToken();

  if (!apiToken) {
    console.error('❌ Cliq API token not configured');
    return null;
  }

  try {
    // Use /chats endpoint instead of /channels
    const endpoint = `https://cliq.zoho.com/api/v2/chats/${channelId}/message`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Cliq API error:', errorText);

      // Try to parse error and check if token invalid
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.code === 'oauthtoken_invalid') {
          console.log('🔄 Token invalid, refreshing...');
          const newToken = await refreshAccessToken();
          if (newToken) {
            return postToChannelAPI({ channelId, text });
          }
        }
      } catch (e) {
        // Ignore JSON parse error
      }

      return null;
    }

    const result = await response.json();
    console.log(`✅ Posted message to channel ${channelId} via REST API`);
    return result;
  } catch (error) {
    console.error('❌ Failed to post to channel:', error);
    return null;
  }
}
