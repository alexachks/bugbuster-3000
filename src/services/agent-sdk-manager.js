/**
 * Agent SDK Manager
 * Manages persistent Agent SDK V2 sessions per Cliq channel
 */

import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk';
import { mcpServer } from '../tools/sdk-tools.js';

const SYSTEM_PROMPT = `You are BugBuster 3000, a technical support agent for the Awkward CRM development team.

You work in a Cliq group chat helping developers investigate bugs, analyze code, check logs, and create Jira tickets.

Your personality:
- Casual and friendly like a teammate
- Direct and concise - keep messages short
- No excessive formality or corporate speak

Your tools:
- query_logs: Check Docker container logs for errors
- create_jira_ticket: Create Jira tickets for confirmed bugs
- check_env_vars: Verify environment variables

Code access:
- You have full access to the codebase at ${process.env.REPO_CLONE_PATH || '/tmp/repo'}
- Use built-in tools (Read, Grep, Glob, etc.) to analyze code

Important:
- This is a group chat - multiple users may message you
- Always keep context from previous messages
- You can send multiple messages while working (progress updates, findings, etc.)
- All messages are about Awkward CRM - never ask "which app?"`;

/**
 * Session Manager for Agent SDK
 */
class AgentSDKManager {
  constructor() {
    // Map: channelId -> session object
    this.sessions = new Map();
  }

  /**
   * Get or create a persistent session for a channel
   * Sessions never expire - they persist for the lifetime of the channel
   */
  async getOrCreateSession(channelId) {
    // Return existing session if available
    if (this.sessions.has(channelId)) {
      console.log(`♻️  Reusing existing session for channel ${channelId}`);
      return this.sessions.get(channelId);
    }

    console.log(`🆕 Creating new session for channel ${channelId}`);

    try {
      // Create new Agent SDK V2 session
      const session = unstable_v2_createSession({
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: SYSTEM_PROMPT,
        cwd: process.env.REPO_CLONE_PATH || '/tmp/repo',
        mcpServers: {
          'cliq-tools': mcpServer
        },
        // Use Claude Code preset tools for code analysis
        tools: {
          type: 'preset',
          preset: 'claude_code'
        },
        // Allow bypassing permissions for automation
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true
      });

      // Store session
      this.sessions.set(channelId, session);
      console.log(`✅ Session created for channel ${channelId}`);

      return session;
    } catch (error) {
      console.error(`❌ Failed to create session for channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Manually close a session (if needed for cleanup)
   */
  closeSession(channelId) {
    const session = this.sessions.get(channelId);
    if (session) {
      console.log(`🗑️  Closing session for channel ${channelId}`);
      try {
        session.close();
      } catch (error) {
        console.error(`⚠️  Error closing session for channel ${channelId}:`, error);
      }
      this.sessions.delete(channelId);
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }

  /**
   * Get all active channel IDs
   */
  getActiveChannels() {
    return Array.from(this.sessions.keys());
  }
}

// Singleton instance
export const agentManager = new AgentSDKManager();
