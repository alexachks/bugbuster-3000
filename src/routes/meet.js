/**
 * Google Meet / Recall.ai Integration Routes
 * Handles webhooks from Recall.ai for meeting events
 */

import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { meetBotManager } from '../services/meet-bot-manager.js';
import { agentManager } from '../services/bugbuster-manager.js';

const router = express.Router();

// Deduplication: track processed transcripts to avoid duplicate responses
// Map: botId -> Set of processed transcript hashes (last 10)
const processedTranscripts = new Map();
const MAX_HISTORY = 10;

// Transcript buffering: collect transcripts within a time window
// Map: botId -> {
//   currentBuffer: [],     // Active buffer being accumulated
//   pendingBuffer: [],     // Buffer for new transcripts while Claude is processing
//   isProcessing: false,   // Is Claude currently processing?
//   timer: null,
//   lastSpeaker: string,
//   speakers: Set,
//   lastTranscriptTime: number
// }
const transcriptBuffers = new Map();
const BUFFER_TIMEOUT_MS = 5000; // Wait 5s after last transcript before sending to Claude

// Google Meet context instructions for Claude
const MEET_CONTEXT_INSTRUCTIONS = `

CONTEXT: You're listening to a live Google Meet call. You're an active-passive listener.

YOUR ROLE:
- You're LISTENING to their conversation (not directly participating)
- You CAN write messages to chat, but users might not see them (they're in a meeting)
- You CANNOT speak (no voice), only text messages in chat

IMPORTANT - TRANSCRIPT BUFFERING:
- Transcripts are buffered for 5 seconds before being sent to you
- Sometimes you might receive INCOMPLETE messages if someone is speaking for a long time
- If a message seems cut off or incomplete (mid-sentence, unclear context) → respond with [SILENT] and wait for the next message
- Don't make assumptions or create tickets based on incomplete information
- Wait for complete context before taking action

WHAT TO DO:
- Be PROACTIVE: when you hear bugs/feedback/suggestions mentioned → create tickets immediately
- DON'T ask questions about tickets - just create them with what you heard
- Why? Users are in a meeting, they might not notice your chat messages
- Your job: record EVERYTHING useful automatically

WHEN TO WRITE IN CHAT:
- Send confirmation when you created a ticket: "yo made ticket AM-123 for the login bug u mentioned"
- Light engagement is ok: "got it", "on it", "noted"
- Remember: no guarantee they'll respond

IF USER TALKS TO YOU DIRECTLY:
- If they clearly address you (ask you something, mention bugbuster, etc) → respond normally
- This means they're waiting for your answer
- In this case you CAN ask questions if needed

`;


function getTranscriptHash(botId, speaker, transcript) {
  return `${botId}:${speaker}:${transcript.trim().toLowerCase()}`;
}

function isTranscriptProcessed(botId, speaker, transcript) {
  const hash = getTranscriptHash(botId, speaker, transcript);
  const history = processedTranscripts.get(botId);
  return history && history.has(hash);
}

function markTranscriptProcessed(botId, speaker, transcript) {
  const hash = getTranscriptHash(botId, speaker, transcript);

  if (!processedTranscripts.has(botId)) {
    processedTranscripts.set(botId, new Set());
  }

  const history = processedTranscripts.get(botId);
  history.add(hash);

  // Keep only last N transcripts to prevent memory leak
  if (history.size > MAX_HISTORY) {
    const firstHash = history.values().next().value;
    history.delete(firstHash);
  }
}

/**
 * Verify Recall.ai webhook signature
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!secret || !signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return `sha256=${digest}` === signature;
}

/**
 * Recall.ai Webhook Handler
 * Receives events: bot.status_change, transcript.complete, etc.
 */
router.post('/webhook', express.json(), async (req, res) => {
  try {
    console.log('\n📥 ========== RECALL.AI WEBHOOK ==========');
    console.log('Full body:', JSON.stringify(req.body, null, 2));

    // Verify signature (optional but recommended)
    const signature = req.headers['recall-signature'];
    const webhookSecret = process.env.RECALL_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(req.body, signature, webhookSecret);
      if (!isValid) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Quick response to Recall.ai
    res.json({ received: true });

    // Handle different webhook formats
    const event = req.body.event;

    // Real-time transcription webhooks (new format)
    if (event === 'transcript.data' || event === 'transcript.partial_data') {
      await handleRealtimeTranscript(req.body);
      return;
    }

    // Legacy webhooks (old format)
    const eventCode = req.body.event?.code;
    const data = req.body.data || {};

    if (eventCode) {
      processWebhookEvent(eventCode, data);
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Buffer transcript and process after silence period
 */
async function bufferTranscript(botId, speaker, transcript) {
  // Initialize buffer if needed
  if (!transcriptBuffers.has(botId)) {
    transcriptBuffers.set(botId, {
      currentBuffer: [],
      pendingBuffer: [],
      isProcessing: false,
      timer: null,
      lastSpeaker: null,
      speakers: new Set(),
      lastTranscriptTime: Date.now()
    });
  }

  const bufferData = transcriptBuffers.get(botId);
  const now = Date.now();

  // Track unique speakers in this conversation turn
  bufferData.speakers.add(speaker);

  // Calculate time since last transcript
  const timeSinceLastTranscript = now - bufferData.lastTranscriptTime;
  bufferData.lastTranscriptTime = now;

  // Decide which buffer to use based on processing state
  const targetBuffer = bufferData.isProcessing ? bufferData.pendingBuffer : bufferData.currentBuffer;

  // Add to appropriate buffer
  targetBuffer.push({ speaker, transcript, timestamp: now });
  bufferData.lastSpeaker = speaker;

  if (bufferData.isProcessing) {
    console.log(`⏳ Claude is processing, added to pending buffer (${bufferData.pendingBuffer.length} pending)`);
    // Don't start timer while processing - we'll handle pending buffer after Claude finishes
    return;
  }

  // Clear existing timer
  if (bufferData.timer) {
    clearTimeout(bufferData.timer);
  }

  console.log(`⏱️  Buffer timer reset: ${BUFFER_TIMEOUT_MS}ms (speakers=${bufferData.speakers.size})`);

  // Set new timer to process after silence
  bufferData.timer = setTimeout(async () => {
    console.log(`⏰ Silence timeout reached, processing buffer (${bufferData.currentBuffer.length} transcripts)`);
    await processBufferedTranscripts(botId);
  }, BUFFER_TIMEOUT_MS);
}

/**
 * Send chat message to Google Meet via Recall.ai API
 */
async function sendChatMessage(botId, message) {
  try {
    const recallApiUrl = process.env.RECALL_API_URL || 'https://us-west-2.recall.ai/api/v1';
    const recallApiKey = process.env.RECALL_AI_API_KEY;

    await axios.post(
      `${recallApiUrl}/bot/${botId}/send_chat_message/`,
      { message },
      {
        headers: {
          'Authorization': `Token ${recallApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`💬 Sent chat message to Google Meet: "${message.substring(0, 50)}..."`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send chat message:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Process buffered transcripts
 */
async function processBufferedTranscripts(botId) {
  const bufferData = transcriptBuffers.get(botId);
  if (!bufferData || bufferData.currentBuffer.length === 0) {
    return;
  }

  // Mark as processing
  bufferData.isProcessing = true;

  // Format transcripts with speaker names for multi-speaker conversations
  let formattedTranscript;
  const uniqueSpeakers = new Set(bufferData.currentBuffer.map(item => item.speaker));

  if (uniqueSpeakers.size > 1) {
    // Multi-speaker: format as "Speaker1: text, Speaker2: text"
    formattedTranscript = bufferData.currentBuffer
      .map(item => `${item.speaker}: ${item.transcript}`)
      .join(', ');
  } else {
    // Single speaker: just combine text
    formattedTranscript = bufferData.currentBuffer
      .map(item => item.transcript)
      .join(' ');
  }

  const speaker = uniqueSpeakers.size === 1 ? bufferData.lastSpeaker : 'Multiple speakers';

  console.log(`📝 Processing buffered transcript from ${speaker}: "${formattedTranscript.substring(0, 150)}..." (speakers=${uniqueSpeakers.size})`);

  // Clear current buffer (we're processing it now)
  bufferData.currentBuffer = [];
  bufferData.lastSpeaker = null;
  bufferData.speakers.clear();

  // Get bot info (channelId mapping)
  const botInfo = meetBotManager.getBotInfo(botId);

  // Test mode: if no bot info, use Claude directly for testing
  if (!botInfo) {
    console.log(`⚠️  Bot ${botId} not in registry, using test mode with Claude`);

    try {
      // Create a test channel ID based on bot ID
      const testChannelId = `test_${botId}`;

      // Send to Claude for a real response
      const message = `${MEET_CONTEXT_INSTRUCTIONS}

[Google Meet] ${speaker}: ${formattedTranscript}`;
      const response = await agentManager.sendMessage(testChannelId, message);

      if (response && response.trim() && response.trim() !== '[SILENT]') {
        console.log(`🤖 Claude response: ${response.substring(0, 100)}...`);

        // Send response to Google Meet chat
        await sendChatMessage(botId, response);
      } else {
        console.log('🤖 Claude chose to stay silent');
      }
    } catch (error) {
      console.error('❌ Failed to process test transcript:', error);
    } finally {
      // Mark as done processing
      bufferData.isProcessing = false;
      // Process pending buffer if any
      await processPendingBuffer(botId);
    }
    return;
  }

  const channelId = botInfo.channelId;

  // Send transcript to Claude (same session as Cliq)
  const message = `${MEET_CONTEXT_INSTRUCTIONS}

[Google Meet] ${speaker}: ${formattedTranscript}`;

  try {
    const response = await agentManager.sendMessage(channelId, message);

    // If Claude responds, send to meeting chat
    if (response && response.trim() && response.trim() !== '[SILENT]') {
      console.log(`🤖 Claude response: ${response.substring(0, 100)}...`);

      // Send response to Google Meet chat
      await sendChatMessage(botId, response);
    }

  } catch (error) {
    console.error('❌ Failed to process buffered transcript:', error);
  } finally {
    // Mark as done processing
    bufferData.isProcessing = false;
    // Process pending buffer if any
    await processPendingBuffer(botId);
  }
}

/**
 * Process pending buffer after Claude finishes
 */
async function processPendingBuffer(botId) {
  const bufferData = transcriptBuffers.get(botId);
  if (!bufferData || bufferData.pendingBuffer.length === 0) {
    return;
  }

  console.log(`📬 Processing pending buffer (${bufferData.pendingBuffer.length} transcripts)`);

  // Move pending to current
  bufferData.currentBuffer = bufferData.pendingBuffer;
  bufferData.pendingBuffer = [];

  // Restore speaker tracking from pending buffer
  bufferData.speakers.clear();
  bufferData.currentBuffer.forEach(item => bufferData.speakers.add(item.speaker));
  bufferData.lastSpeaker = bufferData.currentBuffer[bufferData.currentBuffer.length - 1]?.speaker;

  // Clear any existing timer
  if (bufferData.timer) {
    clearTimeout(bufferData.timer);
  }

  // Start timer for new buffer
  bufferData.timer = setTimeout(async () => {
    console.log(`⏰ Silence timeout reached for pending buffer (${bufferData.currentBuffer.length} transcripts)`);
    await processBufferedTranscripts(botId);
  }, BUFFER_TIMEOUT_MS);
}

/**
 * Handle real-time transcription webhooks
 */
async function handleRealtimeTranscript(payload) {
  const botId = payload.data?.bot?.id;
  const words = payload.data?.data?.words || [];
  const participant = payload.data?.data?.participant;
  const event = payload.event;

  if (!botId || words.length === 0) {
    console.log('⚠️  Empty transcript, skipping');
    return;
  }

  // Combine words into full transcript
  const transcript = words.map(w => w.text).join(' ');
  const speaker = participant?.name || 'Unknown';

  // Skip if speaker is the bot itself
  if (speaker.toLowerCase().includes('bugbuster')) {
    return;
  }

  // Only process complete transcripts (transcript.data), not partial ones
  // This avoids responding to incomplete sentences
  if (event === 'transcript.partial_data') {
    console.log(`🎤 [Partial] ${speaker}: ${transcript} (skipping)`);
    return;
  }

  // Check if we already processed this exact transcript
  if (isTranscriptProcessed(botId, speaker, transcript)) {
    console.log(`⚠️  Duplicate transcript detected, skipping: "${transcript}"`);
    return;
  }

  console.log(`🎤 [Complete] ${speaker}: ${transcript}`);

  // Mark as processed IMMEDIATELY to prevent race conditions
  markTranscriptProcessed(botId, speaker, transcript);

  // Buffer transcripts to combine related utterances
  // All processing now happens in processBufferedTranscripts()
  await bufferTranscript(botId, speaker, transcript);
}

/**
 * Process webhook events
 */
async function processWebhookEvent(eventCode, data) {
  const botId = data.bot_id;
  const botInfo = meetBotManager.getBotInfo(botId);

  if (!botInfo) {
    console.log(`⚠️  Bot ${botId} not found in local registry`);
    return;
  }

  try {
    switch (eventCode) {
      case 'bot.status_change':
        handleBotStatusChange(botId, data, botInfo);
        break;

      case 'bot.transcription.word':
      case 'bot.transcription.interim':
      case 'bot.transcription.complete':
        await handleTranscription(botId, data, botInfo);
        break;

      case 'bot.meeting_ended':
        handleMeetingEnded(botId, data, botInfo);
        break;

      default:
        console.log(`📨 Unhandled event: ${eventCode}`);
    }
  } catch (error) {
    console.error(`❌ Error processing event ${eventCode}:`, error);
  }
}

/**
 * Handle bot status changes
 */
function handleBotStatusChange(botId, data, botInfo) {
  const status = data.status?.code;
  console.log(`🤖 Bot ${botId} status: ${status}`);

  meetBotManager.updateBotStatus(botId, status);

  // Notify Cliq channel
  if (status === 'in_call_not_recording' || status === 'in_waiting_room') {
    const channelId = botInfo.channelId;
    const channelName = agentManager.channelNames?.get(channelId);

    if (channelName) {
      import('../routes/cliq.js').then(({ sendViaWebhook }) => {
        sendViaWebhook(channelId, channelName, `✅ joined the meeting!`);
      });
    }
  }
}

/**
 * Handle transcription events
 */
async function handleTranscription(botId, data, botInfo) {
  // Only process complete transcriptions (not interim/word-level)
  if (!data.transcript || data.transcript.trim() === '') {
    return;
  }

  const speaker = data.speaker || 'Unknown';
  const transcript = data.transcript;
  const channelId = botInfo.channelId;

  console.log(`🎤 [${speaker}]: ${transcript}`);

  // Skip if speaker is the bot itself
  if (speaker.toLowerCase().includes('bugbuster')) {
    return;
  }

  // Send transcript to Claude (same session as Cliq)
  const message = `${MEET_CONTEXT_INSTRUCTIONS}

[Google Meet] ${speaker}: ${transcript}`;

  try {
    const response = await agentManager.sendMessage(channelId, message);

    // If Claude responds, send to meeting chat
    if (response && response.trim() && response.trim() !== '[SILENT]') {
      console.log(`🤖 Claude response: ${response.substring(0, 100)}...`);

      // Send response to Google Meet chat
      await sendChatMessage(botId, response);
    }

  } catch (error) {
    console.error('❌ Failed to process transcript:', error);
  }
}

/**
 * Handle meeting ended
 */
function handleMeetingEnded(botId, data, botInfo) {
  console.log(`🏁 Meeting ended for bot ${botId}`);

  const channelId = botInfo.channelId;
  const channelName = agentManager.channelNames?.get(channelId);

  if (channelName) {
    import('../routes/cliq.js').then(({ sendViaWebhook }) => {
      sendViaWebhook(channelId, channelName, `meeting ended. lemme know if u need a summary or tickets created`);
    });
  }

  // Clean up
  meetBotManager.activeBots.delete(botId);
}

/**
 * Health check for Meet integration
 */
router.get('/health', (req, res) => {
  const activeBots = meetBotManager.getActiveBots();

  res.json({
    status: 'healthy',
    service: 'Google Meet Integration',
    recall_ai: {
      configured: !!process.env.RECALL_AI_API_KEY,
      active_bots: activeBots.length,
      bots: activeBots
    }
  });
});

export default router;
