import express from 'express';
import crypto from 'crypto';
import { ClaudeAgent } from '../services/claude-agent.js';
import { sendCliqMessage, reactToMessage, postToChannelAPI } from '../services/cliq.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * Verify Cliq webhook signature
 */
function verifyCliqSignature(req) {
  const webhookSecret = process.env.CLIQ_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('⚠️ Cliq webhook secret not configured - skipping signature verification');
    return true;
  }

  const signature = req.headers['x-cliq-signature'];
  if (!signature) {
    return false;
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Cliq webhook endpoint
 * Receives messages from Cliq channel
 */
router.post('/', async (req, res) => {
  try {
    // Verify signature
    if (!verifyCliqSignature(req)) {
      console.error('❌ Invalid Cliq webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { message, user, channel, thread_id } = req.body;

    console.log(`📨 Cliq webhook received from user ${user?.id} in channel ${channel?.id}`);

    // Ignore messages from the bot itself
    if (user?.is_bot) {
      return res.status(200).json({ status: 'ignored', reason: 'bot message' });
    }

    // Quick acknowledgment
    res.status(200).json({ status: 'received' });

    // React to message to show we're processing
    try {
      await reactToMessage({
        channelId: channel.id,
        messageId: message.id,
        emoji: '👀'
      });
    } catch (error) {
      console.warn('⚠️ Failed to react to message:', error.message);
    }

    // Process message asynchronously
    processMessageAsync({
      messageText: message.text,
      messageId: message.id,
      userId: user.id,
      userName: user.name,
      channelId: channel.id,
      channelName: channel.name,
      threadId: thread_id
    });

  } catch (error) {
    console.error('❌ Cliq webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Process message asynchronously
 */
async function processMessageAsync(data) {
  const { messageText, messageId, userId, userName, channelId, channelName, threadId } = data;

  try {
    // Generate conversation ID (use thread_id if available, otherwise channel_id + message_id)
    const conversationId = threadId || `${channelId}-${messageId}`;

    console.log(`🤖 Starting analysis for conversation ${conversationId}`);

    // Send "thinking" message
    await sendCliqMessage({
      channelId,
      message: '🔍 Analyzing your issue... This may take a moment.',
      conversationId,
      threadId
    });

    // Process with Claude Agent
    const result = await ClaudeAgent.processMessage(
      conversationId,
      messageText,
      {
        conversationId,
        channelId,
        userId,
        userName,
        channelName,
        threadId,
        messageId
      }
    );

    // Format response
    let responseMessage = result.response;

    // Add Jira ticket info if created
    if (result.jiraTicket) {
      responseMessage += `\n\n✅ **Jira Ticket Created:** [${result.jiraTicket.ticket_key}](${result.jiraTicket.ticket_url})`;
    }

    // Add tools used summary
    if (result.toolsUsed && result.toolsUsed.length > 0) {
      const toolsSummary = result.toolsUsed
        .map(t => `• ${t.tool}`)
        .join('\n');
      responseMessage += `\n\n---\n_Tools used:_\n${toolsSummary}`;
    }

    // Send response to Cliq
    await sendCliqMessage({
      channelId,
      message: responseMessage,
      conversationId,
      threadId
    });

    // React with checkmark
    await reactToMessage({
      channelId,
      messageId,
      emoji: '✅'
    });

    console.log(`✅ Analysis complete for conversation ${conversationId}`);

  } catch (error) {
    console.error('❌ Failed to process message:', error);

    // Send error message to Cliq
    try {
      await sendCliqMessage({
        channelId: data.channelId,
        message: `❌ Sorry, I encountered an error while analyzing your issue:\n\n\`\`\`\n${error.message}\n\`\`\`\n\nPlease try again or contact support.`,
        conversationId: data.threadId || `${data.channelId}-${data.messageId}`,
        threadId: data.threadId
      });

      // React with error emoji
      await reactToMessage({
        channelId: data.channelId,
        messageId: data.messageId,
        emoji: '❌'
      });
    } catch (cliqError) {
      console.error('❌ Failed to send error message to Cliq:', cliqError);
    }
  }
}

/**
 * Participation Handler endpoint
 * Handles messages from Cliq channels where bot participates
 *
 * HYBRID APPROACH:
 * 1. Quick initial response (to avoid Deluge timeout)
 * 2. Async full analysis sent via Incoming Webhook
 */
router.post('/participate', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  try {
    // Log raw body for debugging
    console.log('\n📦 Raw request body:', JSON.stringify(req.body, null, 2));

    const { message, user_name, user_id, channel_id, channel_name, timestamp, message_id } = req.body;

    console.log(`\n📨 Participation: ${user_name} in ${channel_name}`);
    console.log(`Message: ${message?.substring(0, 100)}...`);

    if (!message || !user_name || !channel_id) {
      return res.status(400).json({
        should_respond: false,
        error: 'Missing required fields'
      });
    }

    const conversationId = channel_id;

    // Save user message to Cliq messages table
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check if bot already responded to this message_id
    if (message_id) {
      const { data: existingMessages } = await supabase
        .from('cliq_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('message_id', message_id)
        .eq('role', 'user')
        .limit(1);

      if (existingMessages && existingMessages.length > 0) {
        console.log(`⏭️ Already processed message ${message_id} - skipping`);
        return res.json({ should_respond: false });
      }
    }

    const { data: insertedData, error: insertError } = await supabase.from('cliq_messages').insert({
      conversation_id: conversationId,
      channel_id: channel_id,
      channel_name: channel_name || 'Unknown',
      user_id: user_id,
      user_name: user_name,
      message_text: message,
      message_id: message_id || null,
      role: 'user'
    }).select();

    if (insertError) {
      console.error('❌ Failed to save user message to Supabase:', insertError);
      throw insertError;
    }

    console.log('✅ User message saved to Supabase:', insertedData?.[0]?.id);

    // Load conversation history
    const { data: allMessages, error: historyError } = await supabase
      .from('cliq_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(51);

    if (historyError) {
      console.error('⚠️ Error loading message history:', historyError);
    }

    // Build conversation context
    let conversationContext = '';
    if (allMessages && allMessages.length > 1) {
      const previousMessages = allMessages.slice(0, -1);
      conversationContext = '\n\n=== COMPLETE CONVERSATION HISTORY (chronological order, oldest to newest) ===\n';
      previousMessages.forEach((msg, index) => {
        const speaker = msg.role === 'user' ? msg.user_name : 'You (Bot)';
        conversationContext += `[Message ${index + 1}] ${speaker}: ${msg.message_text}\n`;
      });
      conversationContext += '=== END OF HISTORY ===\n';
      console.log(`📚 Loaded ${previousMessages.length} previous messages for context`);
    }

    const messageWithContext = conversationContext
      ? `${conversationContext}\n\n🔵 CURRENT MESSAGE #${allMessages?.length || 1} (respond ONLY to this) from ${user_name}:\n"${message}"`
      : `🔵 CURRENT MESSAGE from ${user_name}:\n"${message}"`;

    // QUICK AI RESPONSE: Generate fast initial response WITHOUT tools
    console.log(`⚡ Generating quick AI response...`);
    const quickResult = await ClaudeAgent.processMessage(
      conversationId,
      messageWithContext,
      {
        conversationId,
        channelId: channel_id,
        userId: user_id,
        userName: user_name,
        channelName: channel_name,
        skipTools: true // Don't use tools for quick response
      }
    );

    // Check if bot decided to ignore this message
    if (quickResult.ignored) {
      console.log(`🚫 Bot chose to ignore message: ${quickResult.ignoreReason}`);
      return res.json({ should_respond: false });
    }

    const quickResponse = quickResult.response || 'hey whats up';
    console.log(`⚡ Quick response ready: "${quickResponse.substring(0, 50)}..."`);

    // Start async DEEP analysis with tools in background
    processParticipationAsync({
      conversationId,
      messageWithContext,
      channelId: channel_id,
      userId: user_id,
      userName: user_name,
      channelName: channel_name,
      supabase,
      initialResponse: quickResponse
    });

    // Return quick AI response immediately
    return res.json({ text: quickResponse });

  } catch (error) {
    console.error('❌ Participation handler error:', error);
    return res.status(500).json({
      should_respond: false,
      error: error.message
    });
  }
});

/**
 * Process participation message asynchronously
 * Performs DEEP analysis with tools and sends updates via Incoming Webhook
 */
async function processParticipationAsync(data) {
  const { conversationId, messageWithContext, channelId, userId, userName, channelName, supabase, initialResponse } = data;

  try {
    console.log(`🔄 Starting DEEP async analysis with tools for conversation ${conversationId}`);

    // Process with AI WITH TOOLS (full analysis)
    const result = await ClaudeAgent.processMessage(
      conversationId,
      messageWithContext,
      {
        conversationId,
        channelId,
        userId,
        userName,
        channelName,
        skipTools: false // Enable tools for deep analysis
      }
    );

    console.log(`✅ Claude Agent completed DEEP analysis`);

    // Check if bot decided to ignore this message
    if (result.ignored) {
      console.log(`🚫 Bot chose to ignore message during deep analysis: ${result.ignoreReason}`);
      return;
    }

    // Build full response
    let botResponse = result.response || initialResponse;

    // Only send follow-up if the deep analysis found something NEW
    const hasNewInfo = result.toolsUsed && result.toolsUsed.length > 0;
    const hasJiraTicket = result.jiraTicket;

    if (!hasNewInfo && !hasJiraTicket) {
      console.log('⏭️ No new info from deep analysis, skipping follow-up message');
      return;
    }

    // Add Jira ticket info if created
    if (hasJiraTicket) {
      botResponse = `✅ *Jira Ticket Created:* [${result.jiraTicket.ticket_key}](${result.jiraTicket.ticket_url})`;
    }

    // Save bot response to Supabase
    await supabase.from('cliq_messages').insert({
      conversation_id: conversationId,
      channel_id: channelId,
      channel_name: channelName || 'Unknown',
      user_id: 'bot',
      user_name: 'BugBuster 3000',
      message_text: botResponse,
      bot_response: botResponse,
      jira_ticket_key: result.jiraTicket?.ticket_key || null,
      jira_ticket_url: result.jiraTicket?.ticket_url || null,
      role: 'assistant'
    });

    console.log('✅ Bot follow-up response saved to Supabase');

    // Send follow-up via Incoming Webhook (doesn't require OAuth scopes)
    await sendViaWebhook(channelId, botResponse);

    console.log(`✅ Deep analysis complete for conversation ${conversationId}`);

  } catch (error) {
    console.error('❌ Failed to process deep analysis:', error);

    // Send error via webhook only if it's critical
    try {
      await sendViaWebhook(
        channelId,
        `❌ hmm ran into an issue during deeper analysis. might wanna check logs`
      );
    } catch (webhookError) {
      console.error('❌ Failed to send error via webhook:', webhookError);
    }
  }
}

/**
 * Send message via Cliq Incoming Webhook
 */
async function sendViaWebhook(channelId, text) {
  const webhookUrl = process.env.CLIQ_BOT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ CLIQ_BOT_WEBHOOK_URL not configured');
    return;
  }

  try {
    // Send text AND channel_id so Deluge can route it
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
    console.log(`✅ Posted message via webhook:`, result);
  } catch (error) {
    console.error('❌ Failed to send via webhook:', error);
    throw error;
  }
}

export default router;
