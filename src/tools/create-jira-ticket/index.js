/**
 * Create Jira Ticket Tool
 */

export const definition = {
  name: 'create_jira_ticket',
  description: 'Create a Jira ticket for bugs, issues, or feature requests. Use when user reports something that needs tracking.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, descriptive title'
      },
      description: {
        type: 'string',
        description: 'Detailed description with all relevant info (logs, files, steps, etc)'
      },
      priority: {
        type: 'string',
        enum: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
        description: 'Priority level (default: Medium)'
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of labels (e.g., ["bug", "backend", "urgent"])'
      }
    },
    required: ['title', 'description']
  }
};

export async function execute({ title, description, priority = 'Medium', labels }) {
  try {
    console.log(`🎫 Creating Jira ticket: "${title}"`);

    let fullDescription = description;
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
          name: 'Task'
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
      console.error(`❌ Jira API error (${response.status}):`, errorData);
      throw new Error(`Jira API error: ${response.status} - ${errorData}`);
    }

    const result = await response.json();
    const ticketKey = result.key;
    const ticketUrl = `${process.env.JIRA_BASE_URL}/browse/${ticketKey}`;

    console.log(`✅ Jira ticket created: ${ticketKey}`);
    return `✅ Jira ticket created successfully!\n\nTicket: ${ticketKey}\nURL: ${ticketUrl}\nPriority: ${priority}\nTitle: ${title}`;
  } catch (error) {
    console.error(`❌ Jira ticket creation failed:`, error.message);
    return `❌ Failed to create Jira ticket: ${error.message}`;
  }
}
