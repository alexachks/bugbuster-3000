/**
 * Tools Registry
 * Central export for all BugBuster tools
 */

import * as createJiraTicket from './create-jira-ticket/index.js';
import * as serverExec from './server-exec/index.js';
import * as updateMemory from './update-memory/index.js';
import * as joinMeet from './join-meet/index.js';

// Tool definitions for Anthropic API
export const tools = [
  serverExec.definition,
  createJiraTicket.definition,
  updateMemory.definition,
  joinMeet.definition
];

// Tool executor
export async function executeTool(toolName, input, context) {
  switch (toolName) {
    case 'server_exec':
      return await serverExec.execute(input);
    case 'create_jira_ticket':
      return await createJiraTicket.execute(input);
    case 'update_memory':
      return await updateMemory.execute(input);
    case 'join_google_meet':
      return await joinMeet.execute(input, context);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
