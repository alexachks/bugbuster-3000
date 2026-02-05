/**
 * Tool Executor - Central registry for all AI Agent tools
 *
 * Tools available to Claude Agent:
 * 1. claude_code_chat - Interactive conversation with Claude Code for ALL code analysis
 * 2. query_logs - Query Docker container logs
 * 3. check_env_vars - Verify environment variables
 * 4. ask_user - Ask clarifying question in Cliq
 * 5. create_jira_ticket - Create Jira ticket
 */

import { claudeCodeChat } from './claude-code-chat.js';
import { queryLogs } from './query-logs.js';
import { checkEnvVars } from './check-env-vars.js';
import { askUser } from './ask-user.js';
import { createJiraTicket } from './create-jira-ticket.js';

/**
 * Tool definitions for Claude API
 * These match the Anthropic tool use format
 */
export const toolDefinitions = [
  {
    name: 'claude_code_chat',
    description: 'Start or continue an interactive conversation with Claude Code for ALL code-related questions. Claude Code has full access to the repository and can search code, read files, analyze git history, and answer any code questions. Use this as your ONLY tool for code analysis. You can have a multi-turn conversation with follow-up questions.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Your message/question to Claude Code. Be specific about what you need to understand.'
        },
        session_id: {
          type: 'string',
          description: 'Optional: Session ID to continue existing conversation. Omit to start new session.'
        },
        end_session: {
          type: 'boolean',
          description: 'Set to true to end the current session. Default: false'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'query_logs',
    description: 'Query Docker container logs to find errors and warnings. Use this to investigate runtime issues.',
    input_schema: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          description: 'Container name: "main-app" or "seo-engine"',
          enum: ['main-app', 'seo-engine']
        },
        query: {
          type: 'string',
          description: 'Search pattern to filter logs'
        },
        tail: {
          type: 'number',
          description: 'Number of lines to retrieve (default: 100)'
        }
      },
      required: ['container']
    }
  },
  {
    name: 'create_jira_ticket',
    description: 'Create a Jira ticket with bug details. Only use this when you have gathered enough information and confirmed it is a real bug.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short, descriptive title for the bug'
        },
        description: {
          type: 'string',
          description: 'Detailed description in Markdown format including: problem statement, root cause, affected files, reproduction steps, and possible fix'
        },
        priority: {
          type: 'string',
          description: 'Priority level',
          enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest']
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of labels (e.g., ["bug", "backend", "urgent"])'
        },
        affected_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of file paths affected by the bug'
        }
      },
      required: ['title', 'description', 'priority']
    }
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question in Cliq. Use this when you need more information to diagnose the issue.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user'
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Provide multiple choice options'
        }
      },
      required: ['question']
    }
  },
  {
    name: 'check_env_vars',
    description: 'Check if environment variables are configured on the server. Use this to verify configuration issues.',
    input_schema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description: 'Service to check: "main-app" or "seo-engine"',
          enum: ['main-app', 'seo-engine']
        },
        var_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of environment variable names to check'
        }
      },
      required: ['service', 'var_names']
    }
  },
  {
    name: 'ignore_message',
    description: 'Use this when the message is NOT about bugs, features, or technical issues. For casual chat, random messages (like "123"), or off-topic conversations - call this tool and you will NOT send any response to the channel.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason why ignoring (e.g., "casual chat", "testing message", "off-topic")'
        }
      },
      required: ['reason']
    }
  }
];

/**
 * Tool executor - routes tool calls to appropriate handlers
 */
export async function executeTool(toolName, toolInput, context) {
  console.log(`🔧 Executing tool: ${toolName}`, toolInput);

  try {
    let result;

    switch (toolName) {
      case 'claude_code_chat':
        result = await claudeCodeChat(toolInput, context);
        break;
      case 'query_logs':
        result = await queryLogs(toolInput, context);
        break;
      case 'check_env_vars':
        result = await checkEnvVars(toolInput, context);
        break;
      case 'ask_user':
        result = await askUser(toolInput, context);
        break;
      case 'create_jira_ticket':
        result = await createJiraTicket(toolInput, context);
        break;
      case 'ignore_message':
        result = {
          tool: 'ignore_message',
          ignored: true,
          reason: toolInput.reason,
          message: `Message ignored: ${toolInput.reason}`
        };
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    console.log(`✅ Tool ${toolName} executed successfully`);
    return result;
  } catch (error) {
    console.error(`❌ Tool ${toolName} failed:`, error.message);
    return {
      error: true,
      message: error.message,
      tool: toolName
    };
  }
}
