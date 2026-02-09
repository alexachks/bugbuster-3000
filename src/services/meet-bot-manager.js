/**
 * Google Meet Bot Manager
 * Manages Recall.ai bots for Google Meet integration
 */

import axios from 'axios';

class MeetBotManager {
  constructor() {
    // Map: botId -> { channelId, meetingUrl, status }
    this.activeBots = new Map();
    this.recallApiKey = process.env.RECALL_AI_API_KEY;
    this.recallApiUrl = process.env.RECALL_API_URL || 'https://us-west-2.recall.ai/api/v1';
    this.botUiUrl = process.env.BOT_UI_URL || `http://localhost:${process.env.PORT || 3002}/bot-ui`;
  }

  /**
   * Create and join a Google Meet bot
   * Returns bot info
   */
  async joinMeeting(meetingUrl, channelId, botName = 'BugBuster 3000') {
    try {
      console.log(`🤖 Creating Recall.ai bot for meeting: ${meetingUrl}`);

      const webhookUrl = process.env.RECALL_WEBHOOK_URL || `${this.botUiUrl.replace('/bot-ui', '')}/meet/webhook`;

      const response = await axios.post(
        `${this.recallApiUrl}/bot`,
        {
          meeting_url: meetingUrl,
          bot_name: botName,
          recording_config: {
            realtime_endpoints: [
              {
                type: 'webhook',
                url: webhookUrl,
                events: ['transcript.data', 'transcript.partial_data']
              }
            ],
            transcript: {
              provider: {
                recallai_streaming: {
                  mode: 'prioritize_low_latency',
                  language_code: 'en'  // Only 'en' supported in low latency mode
                }
              }
            }
          }
        },
        {
          headers: {
            'Authorization': `Token ${this.recallApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const botId = response.data.id;
      const botInfo = {
        botId,
        channelId,
        meetingUrl,
        status: 'joining',
        createdAt: new Date().toISOString()
      };

      this.activeBots.set(botId, botInfo);

      console.log(`✅ Bot created: ${botId} for channel ${channelId}`);
      return botInfo;

    } catch (error) {
      console.error('❌ Failed to create Recall.ai bot:', error.response?.data || error.message);
      throw new Error(`Failed to join meeting: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get bot info by botId
   */
  getBotInfo(botId) {
    return this.activeBots.get(botId);
  }

  /**
   * Find bot by channelId
   */
  getBotByChannelId(channelId) {
    for (const [botId, info] of this.activeBots.entries()) {
      if (info.channelId === channelId) {
        return { botId, ...info };
      }
    }
    return null;
  }

  /**
   * Update bot status
   */
  updateBotStatus(botId, status) {
    const bot = this.activeBots.get(botId);
    if (bot) {
      bot.status = status;
      bot.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Leave meeting (remove bot)
   */
  async leaveMeeting(botId) {
    try {
      console.log(`🚪 Removing bot: ${botId}`);

      await axios.delete(
        `${this.recallApiUrl}/bot/${botId}`,
        {
          headers: {
            'Authorization': `Token ${this.recallApiKey}`
          }
        }
      );

      this.activeBots.delete(botId);
      console.log(`✅ Bot removed: ${botId}`);

    } catch (error) {
      console.error('❌ Failed to remove bot:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get all active bots
   */
  getActiveBots() {
    return Array.from(this.activeBots.entries()).map(([botId, info]) => ({
      botId,
      ...info
    }));
  }
}

// Singleton instance
export const meetBotManager = new MeetBotManager();
