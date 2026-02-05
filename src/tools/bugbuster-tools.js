/**
 * Cliq Tools for Anthropic API
 * Provides debugging tools in standard Anthropic format
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Tool definitions for Anthropic API
 */
export const tools = [
  {
    name: 'query_logs',
    description: 'Query Docker container logs to find errors and warnings. Use this to investigate runtime issues.',
    input_schema: {
      type: 'object',
      properties: {
        container: {
          type: 'string',
          enum: ['main-app', 'seo-engine'],
          description: 'Container name: "main-app" or "seo-engine"'
        },
        query: {
          type: 'string',
          description: 'Search pattern to filter logs (grep)'
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
    name: 'check_env_vars',
    description: 'Check if environment variables are configured on the server. Use this to verify configuration issues.',
    input_schema: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          enum: ['main-app', 'seo-engine'],
          description: 'Service to check: "main-app" or "seo-engine"'
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
          enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
          description: 'Priority level'
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
  }
];

/**
 * Execute tool by name
 */
export async function executeTool(toolName, input) {
  switch (toolName) {
    case 'query_logs':
      return await queryLogs(input);
    case 'check_env_vars':
      return await checkEnvVars(input);
    case 'create_jira_ticket':
      return await createJiraTicket(input);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Query Docker logs
 */
async function queryLogs({ container, query, tail = 100 }) {
  try {
    const containerName = container === 'main-app'
      ? process.env.MAIN_APP_CONTAINER_NAME || 'awkward-crm-app'
      : process.env.SEO_ENGINE_CONTAINER_NAME || 'awkward-crm-seo-engine';

    let command = `docker logs ${containerName} --tail ${tail}`;

    if (query) {
      command += ` 2>&1 | grep -i "${query}"`;
    }

    const { stdout, stderr } = await execAsync(command);
    const output = stdout || stderr;

    if (!output || output.trim() === '') {
      return `No logs found for container ${container}${query ? ` matching "${query}"` : ''}`;
    }

    return `Logs from ${container} (last ${tail} lines${query ? `, filtered by "${query}"` : ''}):\n\n${output}`;
  } catch (error) {
    return `Error querying logs: ${error.message}`;
  }
}

/**
 * Check environment variables
 */
async function checkEnvVars({ service, var_names }) {
  try {
    const containerName = service === 'main-app'
      ? process.env.MAIN_APP_CONTAINER_NAME || 'awkward-crm-app'
      : process.env.SEO_ENGINE_CONTAINER_NAME || 'awkward-crm-seo-engine';

    const results = {};

    for (const varName of var_names) {
      try {
        const command = `docker exec ${containerName} printenv ${varName}`;
        const { stdout } = await execAsync(command);
        results[varName] = {
          exists: true,
          value_length: stdout.trim().length,
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

    return `Environment variables for ${service}:\n\n${summary}\n\nDetails:\n${JSON.stringify(results, null, 2)}`;
  } catch (error) {
    return `Error checking environment variables: ${error.message}`;
  }
}

/**
 * Create Jira ticket
 */
async function createJiraTicket({ title, description, priority, labels, affected_files }) {
  try {
    let fullDescription = description;

    if (affected_files && affected_files.length > 0) {
      fullDescription += `\n\n## Affected Files\n`;
      affected_files.forEach(file => {
        fullDescription += `• ${file}\n`;
      });
    }

    fullDescription += `\n\n---\n_Created by BugBuster 3000 AI Agent_`;

    const jiraUrl = `${process.env.JIRA_BASE_URL}/rest/api/2/issue`;

    const issueData = {
      fields: {
        project: {
          key: process.env.JIRA_PROJECT_KEY
        },
        summary: title,
        description: fullDescription,
        issuetype: {
          name: 'Bug'
        },
        priority: {
          name: priority
        }
      }
    };

    if (labels && labels.length > 0) {
      issueData.fields.labels = labels;
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

    return `✅ Jira ticket created successfully!\n\nTicket: ${ticketKey}\nURL: ${ticketUrl}\nPriority: ${priority}\nTitle: ${title}`;
  } catch (error) {
    return `❌ Failed to create Jira ticket: ${error.message}`;
  }
}
