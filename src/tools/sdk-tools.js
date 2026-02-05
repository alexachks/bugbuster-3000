/**
 * Custom MCP Tools for Agent SDK
 * Provides Cliq-specific tools via Model Context Protocol
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Query Docker container logs
 */
const queryLogsTool = tool(
  'query_logs',
  'Query Docker container logs to find errors and warnings. Use this to investigate runtime issues.',
  {
    container: z.enum(['main-app', 'seo-engine']).describe('Container name: "main-app" or "seo-engine"'),
    query: z.string().optional().describe('Search pattern to filter logs (grep)'),
    tail: z.number().optional().describe('Number of lines to retrieve (default: 100)')
  },
  async (args) => {
    try {
      const containerName = args.container === 'main-app'
        ? process.env.MAIN_APP_CONTAINER_NAME || 'awkward-crm-app'
        : process.env.SEO_ENGINE_CONTAINER_NAME || 'awkward-crm-seo-engine';

      const tailLines = args.tail || 100;

      let command = `docker logs ${containerName} --tail ${tailLines}`;

      // Add grep filter if query provided
      if (args.query) {
        command += ` 2>&1 | grep -i "${args.query}"`;
      }

      const { stdout, stderr } = await execAsync(command);
      const output = stdout || stderr;

      if (!output || output.trim() === '') {
        return {
          content: [{
            type: 'text',
            text: `No logs found for container ${args.container}${args.query ? ` matching "${args.query}"` : ''}`
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Logs from ${args.container} (last ${tailLines} lines${args.query ? `, filtered by "${args.query}"` : ''}):\n\n${output}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error querying logs: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * Check environment variables
 */
const checkEnvVarsTool = tool(
  'check_env_vars',
  'Check if environment variables are configured on the server. Use this to verify configuration issues.',
  {
    service: z.enum(['main-app', 'seo-engine']).describe('Service to check: "main-app" or "seo-engine"'),
    var_names: z.array(z.string()).describe('Array of environment variable names to check')
  },
  async (args) => {
    try {
      const containerName = args.service === 'main-app'
        ? process.env.MAIN_APP_CONTAINER_NAME || 'awkward-crm-app'
        : process.env.SEO_ENGINE_CONTAINER_NAME || 'awkward-crm-seo-engine';

      const results = {};

      for (const varName of args.var_names) {
        try {
          const command = `docker exec ${containerName} printenv ${varName}`;
          const { stdout } = await execAsync(command);
          results[varName] = {
            exists: true,
            value_length: stdout.trim().length,
            // Don't expose actual values for security
            preview: stdout.trim().substring(0, 10) + '...'
          };
        } catch (error) {
          results[varName] = {
            exists: false,
            error: 'Not set'
          };
        }
      }

      const summary = Object.entries(results)
        .map(([name, info]) => `${name}: ${info.exists ? '✓ Set' : '✗ Not set'}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `Environment variables for ${args.service}:\n\n${summary}\n\nDetails:\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error checking environment variables: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * Create Jira ticket
 */
const createJiraTicketTool = tool(
  'create_jira_ticket',
  'Create a Jira ticket with bug details. Only use this when you have gathered enough information and confirmed it is a real bug.',
  {
    title: z.string().describe('Short, descriptive title for the bug'),
    description: z.string().describe('Detailed description in Markdown format including: problem statement, root cause, affected files, reproduction steps, and possible fix'),
    priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).describe('Priority level'),
    labels: z.array(z.string()).optional().describe('Array of labels (e.g., ["bug", "backend", "urgent"])'),
    affected_files: z.array(z.string()).optional().describe('List of file paths affected by the bug')
  },
  async (args) => {
    try {
      // Add affected files to description
      let fullDescription = args.description;

      if (args.affected_files && args.affected_files.length > 0) {
        fullDescription += `\n\n## Affected Files\n`;
        args.affected_files.forEach(file => {
          fullDescription += `• ${file}\n`;
        });
      }

      fullDescription += `\n\n---\n_Created by BugBuster 3000 AI Agent_`;

      // Create Jira ticket via API
      const jiraUrl = `${process.env.JIRA_BASE_URL}/rest/api/2/issue`;

      const issueData = {
        fields: {
          project: {
            key: process.env.JIRA_PROJECT_KEY
          },
          summary: args.title,
          description: fullDescription,
          issuetype: {
            name: 'Bug'
          },
          priority: {
            name: args.priority
          }
        }
      };

      // Add labels if provided
      if (args.labels && args.labels.length > 0) {
        issueData.fields.labels = args.labels;
      }

      const authString = Buffer.from(
        `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
      ).toString('base64');

      const response = await fetch(jiraUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(issueData)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Jira API error: ${response.status} - ${errorData}`);
      }

      const result = await response.json();
      const ticketKey = result.key;
      const ticketUrl = `${process.env.JIRA_BASE_URL}/browse/${ticketKey}`;

      return {
        content: [{
          type: 'text',
          text: `✅ Jira ticket created successfully!\n\nTicket: ${ticketKey}\nURL: ${ticketUrl}\nPriority: ${args.priority}\nTitle: ${args.title}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to create Jira ticket: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * Create and export MCP server with all tools
 */
export const mcpServer = createSdkMcpServer({
  name: 'cliq-tools',
  version: '1.0.0',
  tools: [
    queryLogsTool,
    checkEnvVarsTool,
    createJiraTicketTool
  ]
});
