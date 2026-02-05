import { createClient } from '@supabase/supabase-js';

/**
 * Conversation Manager
 * Manages conversation state, context, and history
 */

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const conversations = new Map();

export class ConversationManager {
  /**
   * Get or create conversation
   */
  static async getConversation(conversationId, metadata = {}) {
    if (conversations.has(conversationId)) {
      return conversations.get(conversationId);
    }

    let conversation;

    // Load from database if Supabase is configured
    if (supabase) {
      const { data, error } = await supabase
        .from('ai_agent_conversations')
        .select('*')
        .eq('conversation_id', conversationId)
        .single();

      if (data && !error) {
        conversation = {
          id: conversationId,
          channelId: data.channel_id,
          userId: data.user_id,
          status: data.status,
          messages: data.messages || [],
          context: data.context || {},
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
    }

    // Create new conversation if not found
    if (!conversation) {
      conversation = {
        id: conversationId,
        channelId: metadata.channelId,
        userId: metadata.userId,
        status: 'active',
        messages: [],
        context: {
          repoPath: process.env.REPO_CLONE_PATH,
          ...metadata
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save to database if Supabase is configured
      if (supabase) {
        await supabase.from('ai_agent_conversations').insert({
          conversation_id: conversationId,
          channel_id: metadata.channelId,
          user_id: metadata.userId,
          status: 'active',
          messages: [],
          context: conversation.context,
          created_at: conversation.createdAt,
          updated_at: conversation.updatedAt
        });
      }
    }

    conversations.set(conversationId, conversation);
    return conversation;
  }

  /**
   * Add message to conversation
   */
  static async addMessage(conversationId, role, content, toolCalls = null, toolResults = null) {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const message = {
      role,
      content,
      timestamp: new Date().toISOString()
    };

    if (toolCalls) {
      message.tool_calls = toolCalls;
    }

    if (toolResults) {
      message.tool_results = toolResults;
    }

    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();

    // Update database if Supabase is configured
    if (supabase) {
      await supabase
        .from('ai_agent_conversations')
        .update({
          messages: conversation.messages,
          updated_at: conversation.updatedAt
        })
        .eq('conversation_id', conversationId);
    }

    return message;
  }

  /**
   * Update conversation context
   */
  static async updateContext(conversationId, updates) {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.context = {
      ...conversation.context,
      ...updates
    };
    conversation.updatedAt = new Date().toISOString();

    // Update database if Supabase is configured
    if (supabase) {
      await supabase
        .from('ai_agent_conversations')
        .update({
          context: conversation.context,
          updated_at: conversation.updatedAt
        })
        .eq('conversation_id', conversationId);
    }

    return conversation.context;
  }

  /**
   * Get conversation messages in Claude API format
   */
  static getMessagesForClaude(conversationId) {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return [];
    }

    return conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Close conversation
   */
  static async closeConversation(conversationId, reason = 'completed') {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return;
    }

    conversation.status = 'closed';
    conversation.updatedAt = new Date().toISOString();

    // Update database if Supabase is configured
    if (supabase) {
      await supabase
        .from('ai_agent_conversations')
        .update({
          status: 'closed',
          closed_reason: reason,
          updated_at: conversation.updatedAt
        })
        .eq('conversation_id', conversationId);
    }

    // Remove from memory after 1 hour
    setTimeout(() => {
      conversations.delete(conversationId);
    }, 3600000);
  }

  /**
   * Clean up old conversations (run periodically)
   */
  static async cleanupOldConversations() {
    if (!supabase) return;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Close inactive conversations
    await supabase
      .from('ai_agent_conversations')
      .update({ status: 'timeout' })
      .eq('status', 'active')
      .lt('updated_at', oneDayAgo);

    console.log('🧹 Cleaned up old conversations');
  }
}

// Run cleanup every hour
setInterval(() => {
  ConversationManager.cleanupOldConversations();
}, 3600000);
