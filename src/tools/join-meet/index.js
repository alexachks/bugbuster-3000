/**
 * Join Google Meet Tool
 * Allows Claude to join Google Meet as a conversational participant
 */

import { meetBotManager } from '../../services/meet-bot-manager.js';

export const definition = {
  name: 'join_google_meet',
  description: 'Join a Google Meet as a conversational participant. Use when user shares a Google Meet link and wants you to join the meeting. You will be able to listen and speak in the meeting.',
  input_schema: {
    type: 'object',
    properties: {
      meeting_url: {
        type: 'string',
        description: 'Google Meet URL (e.g., https://meet.google.com/abc-defg-hij)'
      }
    },
    required: ['meeting_url']
  }
};

/**
 * Extract Google Meet URL from text
 */
function extractMeetUrl(text) {
  const meetRegex = /https?:\/\/meet\.google\.com\/[a-z\-]+/i;
  const match = text.match(meetRegex);
  return match ? match[0] : null;
}

export async function execute({ meeting_url }, context = {}) {
  try {
    const { channelId } = context;

    if (!channelId) {
      return '❌ Error: Channel context required to join meeting';
    }

    // Validate URL
    if (!meeting_url.includes('meet.google.com')) {
      return '❌ Invalid Google Meet URL. Please provide a valid meet.google.com link.';
    }

    // Check if already in a meeting for this channel
    const existingBot = meetBotManager.getBotByChannelId(channelId);
    if (existingBot) {
      return `⚠️ Already in a meeting for this channel. Bot ID: ${existingBot.botId}`;
    }

    console.log(`🎥 Joining Google Meet: ${meeting_url} for channel ${channelId}`);

    // Join meeting
    const botInfo = await meetBotManager.joinMeeting(meeting_url, channelId);

    return `✅ Joining Google Meet!

Bot ID: ${botInfo.botId}
Meeting: ${meeting_url}

I'm now joining the meeting and will be able to hear and speak. Give me a few seconds to connect...`;

  } catch (error) {
    console.error('❌ join_google_meet error:', error);
    return `❌ Failed to join meeting: ${error.message}`;
  }
}
