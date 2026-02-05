/**
 * Cliq Integration Routes
 * Handles Participation Handler for Cliq bot
 */

import express from 'express';
import { agentManager } from '../services/bugbuster-manager.js';

const router = express.Router();

/**
 * Format channel name to Cliq unique name
 * Example: "#test agent" -> "testagent"
 * Example: "#RANQT - Bugs/Issues/Suggestions" -> "ranqtbugsissuessuggestions"
 */
function formatChannelUniqueName(channelName) {
  let uniqueName = channelName;

  // Remove # if present
  if (uniqueName.startsWith('#')) {
    uniqueName = uniqueName.substring(1);
  }

  // Remove all non-alphanumeric characters (keep only letters and numbers)
  uniqueName = uniqueName.replace(/[^a-zA-Z0-9]/g, '');

  // Convert to lowercase
  uniqueName = uniqueName.toLowerCase();

  console.log(`📝 Formatted channel name: "${channelName}" -> "${uniqueName}"`);

  return uniqueName;
}

/**
 * Helper: Send message to Cliq channel via Incoming Webhook
 * The webhook handler (Deluge) will post to channel using zoho.cliq.postToChannelAsBot()
 */
export async function sendViaWebhook(channelId, channelName, text) {
  try {
    console.log(`📤 Sending to channel: ${channelName} (${channelId})`);

    const webhookUrl = process.env.CLIQ_BOT_WEBHOOK_URL;

    // Format channel name to unique name (remove # and special chars)
    const uniqueName = formatChannelUniqueName(channelName);

    // Send payload with pre-formatted unique name
    // Deluge just needs to call: zoho.cliq.postToChannelAsBot(uniqueName, "bugbuster", textMessage)
    const payload = {
      text,
      channel_unique_name: uniqueName
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Webhook error:', response.status, errorText);
      throw new Error(`Webhook failed: ${response.status}`);
    }

    console.log(`✅ Sent message to channel ${uniqueName}`);
    return await response.json();
  } catch (error) {
    console.error('❌ Failed to send message:', error);
    throw error;
  }
}

/**
 * Participation Handler
 * Handles messages from Cliq channels where bot participates
 */
router.post('/participate', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  try {
    console.log(`\n📥 Raw body:`, JSON.stringify(req.body, null, 2));

    const { message, user_name, channel_id, channel_name } = req.body;

    console.log(`\n📨 Participation: ${user_name} in ${channel_name}`);
    console.log(`Message: ${message?.substring(0, 100)}...`);

    // Validate required fields
    if (!message || !user_name || !channel_id) {
      return res.status(400).json({
        should_respond: false,
        error: 'Missing required fields'
      });
    }

    // Quick acknowledgment - don't wait for Agent SDK
    res.json({ should_respond: false });

    // Process with Agent SDK asynchronously
    processWithAgentSDK({
      channelId: channel_id,
      channelName: channel_name,
      userName: user_name,
      message
    });

  } catch (error) {
    console.error('❌ Participation handler error:', error);
    return res.status(500).json({
      should_respond: false,
      error: error.message
    });
  }
});

/**
 * Process message with Anthropic API
 * Sends response to Cliq via webhook
 */
async function processWithAgentSDK(data) {
  const { channelId, channelName, userName, message } = data;

  try {
    console.log(`🤖 Starting processing for channel ${channelId}`);

    // Format: "UserName: message" so agent knows who's talking
    const formattedMessage = `${userName}: ${message}`;

    // Get response from agent (messages sent in real-time during processing)
    const response = await agentManager.sendMessage(channelId, formattedMessage, channelName);

    // Check if agent wants to stay silent
    if (response && response.trim() === '[SILENT]') {
      console.log(`🤫 Agent decided to stay silent (off-topic conversation)`);
      return; // Don't send anything to Cliq
    }

    // Messages already sent in real-time during processing
    console.log(`✅ All messages sent in real-time`);

    const stats = agentManager.getSessionStats(channelId);
    console.log(`✅ Finished - Session total: $${stats.totalCost.toFixed(4)} (${stats.messageCount} messages)`);

  } catch (error) {
    console.error('❌ Processing failed:', error);

    // Send error message to Cliq
    try {
      await sendViaWebhook(
        channelId,
        channelName,
        `ugh something broke: ${error.message}`
      );
    } catch (webhookError) {
      console.error('❌ Failed to send error message via webhook:', webhookError);
    }
  }
}

/**
 * Reset session for a channel (for testing/debugging)
 */
router.post('/reset-session/:channelId', (req, res) => {
  const { channelId } = req.params;

  agentManager.closeSession(channelId);

  res.json({
    success: true,
    message: `Session reset for channel ${channelId}`
  });
});

/**
 * Health check for Cliq integration
 */
router.get('/health', (req, res) => {
  const activeChannels = agentManager.getActiveChannels();

  // Get stats for all active sessions
  const channelStats = {};
  for (const channelId of activeChannels) {
    const stats = agentManager.getSessionStats(channelId);
    channelStats[channelId] = {
      total_cost: stats.totalCost,
      message_count: stats.messageCount,
      created_at: stats.createdAt,
      last_activity_at: stats.lastActivityAt
    };
  }

  res.json({
    status: 'healthy',
    service: 'Cliq Integration',
    agent_sdk: {
      active_sessions: agentManager.getActiveSessionCount(),
      channels: activeChannels,
      session_stats: channelStats
    },
    webhook_configured: !!process.env.CLIQ_BOT_WEBHOOK_URL
  });
});

export default router;
