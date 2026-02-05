import { sendCliqMessage } from '../services/cliq.js';

/**
 * Ask user a clarifying question in Cliq
 * Stores question in conversation context and waits for user response
 */
export async function askUser({ question, options }, context) {
  const { conversationId, channelId, userId } = context;

  if (!conversationId || !channelId) {
    throw new Error('Conversation context missing. Cannot ask user.');
  }

  try {
    // Format message with options if provided
    let message = `❓ **Question:**\n\n${question}`;

    if (options && options.length > 0) {
      message += '\n\n**Options:**\n';
      options.forEach((option, idx) => {
        message += `${idx + 1}. ${option}\n`;
      });
      message += '\n_Reply with the number or your own answer._';
    }

    // Send message to Cliq
    await sendCliqMessage({
      channelId,
      message,
      conversationId
    });

    // Store question in context for later matching
    context.pendingQuestion = {
      question,
      options,
      timestamp: Date.now()
    };

    console.log(`❓ Asked user: ${question}`);

    return {
      tool: 'ask_user',
      success: true,
      question,
      options,
      waiting_for_response: true,
      message: 'Question sent to user. Waiting for response...'
    };
  } catch (error) {
    console.error('❌ Failed to ask user:', error);
    throw new Error(`Failed to send question: ${error.message}`);
  }
}
