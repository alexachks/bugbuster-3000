/**
 * Tools Registry
 * Central export for all BugBuster tools
 */

import * as createTask from './create-task/index.js';
import * as serverExec from './server-exec/index.js';
import * as updateMemory from './update-memory/index.js';
import * as joinMeet from './join-meet/index.js';

// Tool definitions for Anthropic API
export const tools = [
  serverExec.definition,
  createTask.definition,
  updateMemory.definition,
  joinMeet.definition
];

// Tool executor
export async function executeTool(toolName, input, context) {
  switch (toolName) {
    case 'server_exec':
      return await serverExec.execute(input);
    case 'create_task':
      return await createTask.execute(input);
    case 'update_memory':
      return await updateMemory.execute(input);
    case 'join_google_meet':
      return await joinMeet.execute(input, context);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
