import { query } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Claude Agent SDK Integration - Conversational code analysis
 * Uses Claude Agent SDK for full repository access and code analysis
 */

// Store active sessions (session_id -> Claude SDK session_id)
const sessions = new Map();

export async function claudeCodeChat({ message, session_id, end_session = false }, context) {
  const repoPath = context.repoPath || process.env.REPO_CLONE_PATH;

  if (!repoPath) {
    throw new Error('Repository path not configured');
  }

  // End existing session if requested
  if (end_session && session_id && sessions.has(session_id)) {
    sessions.delete(session_id);
    return {
      tool: 'claude_code_chat',
      session_id,
      ended: true,
      message: 'Session ended'
    };
  }

  // Get or create session
  const sessionId = session_id || uuidv4();
  let sessionData = sessions.get(sessionId);

  if (!sessionData) {
    sessionData = {
      id: sessionId,
      sdkSessionId: null,
      created: Date.now()
    };
    sessions.set(sessionId, sessionData);
    console.log(`🤖 Created new Claude Agent session: ${sessionId}`);
  }

  console.log(`💬 Querying Claude Agent SDK: ${message.substring(0, 100)}...`);
  console.log(`📁 Working directory: ${repoPath}`);

  try {
    let fullResponse = '';
    let toolsUsed = [];

    // Query Claude Agent SDK with streaming
    const queryOptions = {
      workingDirectory: repoPath,
      allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
      permissionMode: 'bypassPermissions', // Auto-approve safe tools
      resume: sessionData.sdkSessionId || undefined
    };

    console.log(`⏳ Claude Agent is analyzing the repository...`);

    for await (const msg of query({ prompt: message, options: queryOptions })) {
      // System message with session init
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionData.sdkSessionId = msg.session_id;
        console.log(`🔗 SDK Session ID: ${msg.session_id.substring(0, 8)}...`);
        continue;
      }

      // Assistant messages contain content blocks (text and tool_use)
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          // Text content - stream it
          if (block.type === 'text' && block.text) {
            console.log(`\n💭 ${block.text}`);
            fullResponse += block.text + '\n';
          }
          // Tool use - log which tool is being used
          else if (block.type === 'tool_use') {
            const toolName = block.name || 'unknown';
            if (!toolsUsed.includes(toolName)) {
              toolsUsed.push(toolName);
            }
            console.log(`\n🔧 Using tool: ${toolName}`);
          }
        }
        continue;
      }

      // User messages contain tool results
      if (msg.type === 'user' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            // Show tool result preview (first 100 chars)
            const preview = typeof block.content === 'string'
              ? block.content.substring(0, 100)
              : JSON.stringify(block.content).substring(0, 100);
            console.log(`   ✓ Result: ${preview}${block.content.length > 100 ? '...' : ''}`);
          }
        }
        continue;
      }

      // Final result message
      if (msg.type === 'assistant' && 'result' in msg) {
        fullResponse = msg.result;
        console.log(`\n✅ Final response received`);
        continue;
      }

      // Error messages
      if (msg.type === 'error') {
        console.error(`\n❌ Error: ${msg.error}`);
        throw new Error(msg.error);
      }
    }

    // Update session timestamp
    sessionData.lastUsed = Date.now();

    console.log(`\n✅ Claude Agent response complete (${fullResponse.length} chars)`);
    if (toolsUsed.length > 0) {
      console.log(`🔧 Tools used: ${toolsUsed.join(', ')}`);
    }

    return {
      tool: 'claude_code_chat',
      session_id: sessionId,
      message: fullResponse,
      tools_used: toolsUsed,
      can_continue: true
    };

  } catch (error) {
    console.error('❌ Claude Agent SDK error:', error.message);

    // Don't delete session on error - may want to retry
    throw new Error(`Claude Agent SDK failed: ${error.message}`);
  }
}

// Cleanup old sessions (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000;
  for (const [sessionId, session] of sessions.entries()) {
    if (session.lastUsed && session.lastUsed < oneHourAgo) {
      sessions.delete(sessionId);
      console.log(`🧹 Cleaned up old session: ${sessionId}`);
    }
  }
}, 600000); // Every 10 minutes
