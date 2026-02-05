/**
 * Cliq Integration Routes
 * Handles Participation Handler for Cliq bot
 */

import express from 'express';
import { agentManager } from '../services/agent-sdk-manager.js';

const router = express.Router();

/**
 * Helper: Send message via Cliq Incoming Webhook
 */
async function sendViaWebhook(channelId, text) {
  const webhookUrl = process.env.CLIQ_BOT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ CLIQ_BOT_WEBHOOK_URL not configured');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        channel_id: channelId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Webhook error:', response.status, errorText);
      throw new Error(`Webhook failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Sent message via webhook to channel ${channelId}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send via webhook:', error);
    throw error;
  }
}

/**
 * Participation Handler
 * Handles messages from Cliq channels where bot participates
 */
router.post('/participate', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  try {
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
 * Process message with Agent SDK V2
 * Streams responses to Cliq via webhook
 */
async function processWithAgentSDK(data) {
  const { channelId, userName, message } = data;

  try {
    console.log(`🤖 Starting Agent SDK processing for channel ${channelId}`);

    // Get or create persistent session for this channel
    const session = await agentManager.getOrCreateSession(channelId);

    // Send user message to agent
    // Format: "UserName: message" so agent knows who's talking
    await session.send(`${userName}: ${message}`);

    console.log(`📤 Sent message to Agent SDK, waiting for response...`);

    // Stream responses from agent
    for await (const msg of session.stream()) {
      // Handle assistant messages (agent responses)
      if (msg.type === 'assistant') {
        const textBlocks = msg.message.content.filter(block => block.type === 'text');

        for (const block of textBlocks) {
          const text = block.text?.trim();
          if (text) {
            console.log(`📨 Agent response: ${text.substring(0, 100)}...`);
            await sendViaWebhook(channelId, text);
          }
        }
      }

      // Handle result (final outcome)
      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          console.log(`✅ Agent completed successfully`);
          console.log(`   - Turns: ${msg.num_turns}`);
          console.log(`   - Cost: $${msg.total_cost_usd.toFixed(4)}`);
          console.log(`   - Duration: ${(msg.duration_ms / 1000).toFixed(2)}s`);
        } else {
          console.error(`❌ Agent finished with error: ${msg.subtype}`);
          if (msg.errors && msg.errors.length > 0) {
            console.error(`   Errors:`, msg.errors);
          }
        }
      }

      // Handle errors
      if (msg.type === 'error') {
        console.error(`❌ Agent error:`, msg);
        await sendViaWebhook(
          channelId,
          `❌ oops, ran into an issue. check the logs`
        );
      }
    }

    console.log(`✅ Finished processing for channel ${channelId}`);

  } catch (error) {
    console.error('❌ Agent SDK processing failed:', error);

    // Send error message to Cliq
    try {
      await sendViaWebhook(
        channelId,
        `❌ something went wrong: ${error.message}`
      );
    } catch (webhookError) {
      console.error('❌ Failed to send error message via webhook:', webhookError);
    }
  }
}

/**
 * Health check for Cliq integration
 */
router.get('/health', (req, res) => {
  const activeChannels = agentManager.getActiveChannels();

  res.json({
    status: 'healthy',
    service: 'Cliq Integration',
    agent_sdk: {
      active_sessions: agentManager.getActiveSessionCount(),
      channels: activeChannels
    },
    webhook_configured: !!process.env.CLIQ_BOT_WEBHOOK_URL
  });
});

export default router;
