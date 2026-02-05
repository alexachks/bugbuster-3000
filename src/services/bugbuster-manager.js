/**
 * Agent SDK Manager
 * Manages conversation history and Anthropic API per Cliq channel
 */

import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from '../tools/bugbuster-tools.js';
import fs from 'fs';
import path from 'path';

/**
 * Session Manager using direct Anthropic API
 * Stores conversation history per channel
 */
class AgentSDKManager {
  constructor() {
    // Map: channelId -> array of messages [{ role: 'user'|'assistant', content: string }]
    this.conversationHistory = new Map();
    // Map: channelId -> { totalCost, messageCount, createdAt, lastActivityAt }
    this.sessionStats = new Map();
    // Map: channelId -> timeout ID for auto-cleanup
    this.inactivityTimers = new Map();
    // Inactivity timeout: 30 minutes
    this.INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    // Casual system prompt loaded once
    this.systemPrompt = this.loadSystemPrompt();
    // Anthropic client (lazy init)
    this._client = null;
  }

  /**
   * Get Anthropic client (lazy init to ensure env vars loaded)
   */
  getClient() {
    if (!this._client) {
      this._client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    return this._client;
  }

  /**
   * Load casual system prompt from CLAUDE.md in agent project directory
   */
  loadSystemPrompt() {
    // Use agent project directory, not the cloned repo
    const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const claudeMdPath = path.join(projectRoot, '.claude', 'CLAUDE.md');

    try {
      const prompt = fs.readFileSync(claudeMdPath, 'utf-8');
      console.log(`✅ Loaded casual prompt from ${claudeMdPath} (${prompt.length} chars)`);
      console.log(`🔍 First 200 chars: ${prompt.substring(0, 200)}`);
      return prompt;
    } catch (error) {
      console.warn(`⚠️  Could not load CLAUDE.md: ${error.message}`);
      return 'You are BugBuster 3000, a helpful debugging assistant.';
    }
  }

  /**
   * Get or initialize conversation history for a channel
   */
  getOrInitHistory(channelId) {
    if (!this.conversationHistory.has(channelId)) {
      console.log(`🆕 Initializing conversation history for channel ${channelId}`);
      this.conversationHistory.set(channelId, []);

      // Initialize stats
      this.sessionStats.set(channelId, {
        totalCost: 0,
        messageCount: 0,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString()
      });

      // Start inactivity timer
      this.resetInactivityTimer(channelId);
    } else {
      console.log(`♻️  Reusing conversation history for channel ${channelId} (${this.conversationHistory.get(channelId).length} messages)`);
      this.resetInactivityTimer(channelId);
    }

    return this.conversationHistory.get(channelId);
  }

  /**
   * Send message using Anthropic API
   * Returns response text
   */
  async sendMessage(channelId, userMessage) {
    console.log(`🤖 Processing message for channel ${channelId}`);

    // Get conversation history
    const history = this.getOrInitHistory(channelId);

    // Add user message to history
    history.push({
      role: 'user',
      content: userMessage
    });

    console.log(`📝 History length: ${history.length} messages`);
    console.log(`📤 Sending to Anthropic API with ${history.length} messages`);

    try {
      const client = this.getClient();
      let response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: this.systemPrompt, // Casual style
        messages: [...history], // Full history
        tools: tools // Add tools
      });

      // Tool execution loop
      let assistantText = '';
      const MAX_TOOL_ROUNDS = 5;
      let toolRound = 0;

      while (toolRound < MAX_TOOL_ROUNDS) {
        // Extract text from current response
        for (const block of response.content) {
          if (block.type === 'text') {
            assistantText += block.text;
          }
        }

        // Check for tool calls
        const toolCalls = response.content.filter(block => block.type === 'tool_use');

        if (toolCalls.length === 0) {
          // No more tool calls, we're done
          break;
        }

        console.log(`🔧 Agent requested ${toolCalls.length} tool calls (round ${toolRound + 1})`);

        // Add assistant message with tool calls to history
        history.push({
          role: 'assistant',
          content: response.content
        });

        // Execute tools and collect results
        const toolResults = [];
        for (const toolCall of toolCalls) {
          console.log(`   - Executing: ${toolCall.name}`);
          try {
            const result = await executeTool(toolCall.name, toolCall.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: result
            });
            console.log(`   ✓ ${toolCall.name} completed`);
          } catch (error) {
            console.error(`   ✗ ${toolCall.name} failed:`, error.message);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: `Error: ${error.message}`,
              is_error: true
            });
          }
        }

        // Add tool results to history
        history.push({
          role: 'user',
          content: toolResults
        });

        // Get next response from Claude with tool results
        response = await client.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 8192,
          system: this.systemPrompt,
          messages: [...history],
          tools: tools
        });

        toolRound++;
      }

      // Add final assistant response to history
      history.push({
        role: 'assistant',
        content: response.content
      });

      // Track cost
      const inputCost = (response.usage.input_tokens / 1000000) * 3; // $3/MTok
      const outputCost = (response.usage.output_tokens / 1000000) * 15; // $15/MTok
      const totalCost = inputCost + outputCost;
      this.addCost(channelId, totalCost);

      console.log(`✅ Response generated: ${assistantText.length} chars`);
      console.log(`💰 Cost: $${totalCost.toFixed(4)} (${response.usage.input_tokens} in, ${response.usage.output_tokens} out)`);

      return assistantText;

    } catch (error) {
      console.error(`❌ API call failed for channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Reset inactivity timer for a channel
   * Called every time there's activity (new message)
   */
  resetInactivityTimer(channelId) {
    // Update last activity timestamp
    const stats = this.sessionStats.get(channelId);
    if (stats) {
      stats.lastActivityAt = new Date().toISOString();
    }

    // Clear existing timer
    if (this.inactivityTimers.has(channelId)) {
      clearTimeout(this.inactivityTimers.get(channelId));
    }

    // Set new timer
    const timerId = setTimeout(() => {
      console.log(`⏰ Session for channel ${channelId} expired due to inactivity (30 minutes)`);
      this.closeSession(channelId);
    }, this.INACTIVITY_TIMEOUT_MS);

    this.inactivityTimers.set(channelId, timerId);
  }

  /**
   * Add cost to session stats
   * Returns updated total cost for the session
   */
  addCost(channelId, cost) {
    if (!this.sessionStats.has(channelId)) {
      this.sessionStats.set(channelId, {
        totalCost: 0,
        messageCount: 0,
        createdAt: new Date().toISOString()
      });
    }

    const stats = this.sessionStats.get(channelId);
    stats.totalCost += cost;
    stats.messageCount += 1;

    return stats.totalCost;
  }

  /**
   * Get session stats
   */
  getSessionStats(channelId) {
    return this.sessionStats.get(channelId) || {
      totalCost: 0,
      messageCount: 0,
      createdAt: null,
      lastActivityAt: null
    };
  }

  /**
   * Clear conversation history for a channel
   */
  closeSession(channelId) {
    if (this.conversationHistory.has(channelId)) {
      const stats = this.sessionStats.get(channelId);
      console.log(`🗑️  Clearing conversation history for channel ${channelId}`);
      if (stats) {
        console.log(`   - Total cost: $${stats.totalCost.toFixed(4)}`);
        console.log(`   - Messages: ${stats.messageCount}`);
      }

      // Clear inactivity timer
      if (this.inactivityTimers.has(channelId)) {
        clearTimeout(this.inactivityTimers.get(channelId));
        this.inactivityTimers.delete(channelId);
      }

      this.conversationHistory.delete(channelId);
      this.sessionStats.delete(channelId);
    }
  }

  /**
   * Get active conversation count
   */
  getActiveSessionCount() {
    return this.conversationHistory.size;
  }

  /**
   * Get all active channel IDs
   */
  getActiveChannels() {
    return Array.from(this.conversationHistory.keys());
  }
}

// Singleton instance
export const agentManager = new AgentSDKManager();
