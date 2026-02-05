/**
 * Jira Integration Test
 */

import dotenv from 'dotenv';
dotenv.config();

import { createJiraTicket } from './src/tools/create-jira-ticket.js';

console.log('🧪 Testing Jira integration...\n');
console.log('Configuration:');
console.log('  URL:', process.env.JIRA_BASE_URL);
console.log('  Email:', process.env.JIRA_EMAIL);
console.log('  Project:', process.env.JIRA_PROJECT_KEY);
console.log('  Token:', process.env.JIRA_API_TOKEN ? '✓ Set' : '✗ Missing');
console.log('');

createJiraTicket({
  title: 'Test Ticket from AI Agent',
  description: `This is a test ticket to verify Jira integration.

**Created automatically by AI Agent Service**

System Information:
- Environment: ${process.env.NODE_ENV || 'development'}
- Timestamp: ${new Date().toISOString()}`,
  priority: 'Medium',
  labels: ['test', 'ai-agent', 'automated']
}).then(result => {
  console.log('\n✅ Success! Jira integration working!\n');
  console.log('📋 Ticket created:');
  console.log('  Key:', result.ticket_key);
  console.log('  URL:', result.ticket_url);
  console.log('\n🔗 You can view the ticket at:');
  console.log('  ', result.ticket_url);
  console.log('');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Error creating Jira ticket:\n');
  console.error('Message:', err.message);

  if (err.response) {
    console.error('\nHTTP Status:', err.response.status);
    console.error('Response:', JSON.stringify(err.response.data, null, 2));
  }

  console.error('\n💡 Troubleshooting:');
  console.error('  1. Check that JIRA_BASE_URL is correct');
  console.error('  2. Verify JIRA_EMAIL matches your account');
  console.error('  3. Ensure API token is valid (create new one if needed)');
  console.error('  4. Confirm PROJECT_KEY exists and you have access');
  console.error('');

  process.exit(1);
});
