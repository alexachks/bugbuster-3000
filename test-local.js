/**
 * Local Testing Script
 * Test AI Agent without Cliq integration
 */

import dotenv from 'dotenv';
dotenv.config();

import { ClaudeAgent } from './src/services/claude-agent.js';
import { ConversationManager } from './src/services/conversation-manager.js';

// Mock conversation context
const testContext = {
  conversationId: 'test-local-' + Date.now(),
  channelId: 'test-channel',
  userId: 'test-user',
  userName: 'Test User',
  repoPath: process.env.REPO_CLONE_PATH || '/tmp/repo-clone'
};

console.log('🤖 AI Agent Local Test\n');
console.log('Context:', testContext);
console.log('\n---\n');

// Test message
const testMessage = process.argv[2] || 'Search for authentication code and explain how it works';

console.log(`📨 User Message: "${testMessage}"\n`);
console.log('🔄 Processing...\n');

// Process message
ClaudeAgent.processMessage(testContext.conversationId, testMessage, testContext)
  .then(result => {
    console.log('\n---\n');
    console.log('✅ Agent Response:\n');
    console.log(result.response);

    if (result.toolsUsed && result.toolsUsed.length > 0) {
      console.log('\n---\n');
      console.log('🔧 Tools Used:');
      result.toolsUsed.forEach(tool => {
        console.log(`  • ${tool.tool} ${tool.success ? '✓' : '✗'}`);
      });
    }

    if (result.jiraTicket) {
      console.log('\n---\n');
      console.log('🎫 Jira Ticket Created:');
      console.log(`  Key: ${result.jiraTicket.ticket_key}`);
      console.log(`  URL: ${result.jiraTicket.ticket_url}`);
    }

    console.log('\n✅ Test complete!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
