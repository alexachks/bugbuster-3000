/**
 * Create Jira ticket using Jira REST API
 */
export async function createJiraTicket(
  { title, description, priority, labels = [], affected_files = [] },
  context
) {
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraApiToken = process.env.JIRA_API_TOKEN;
  const jiraProjectKey = process.env.JIRA_PROJECT_KEY;

  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken || !jiraProjectKey) {
    throw new Error('Jira configuration is incomplete. Please check environment variables.');
  }

  try {
    // Build Jira description with affected files
    let fullDescription = description;

    if (affected_files.length > 0) {
      fullDescription += '\n\n---\n\n*Affected Files:*\n';
      affected_files.forEach(file => {
        fullDescription += `• {{${file}}}\n`;
      });
    }

    // Add metadata footer
    fullDescription += '\n\n---\n_Created by AI Support Agent_';

    // Prepare Jira API request
    const issueData = {
      fields: {
        project: {
          key: jiraProjectKey
        },
        summary: title,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: fullDescription
                }
              ]
            }
          ]
        },
        issuetype: {
          name: 'Task'  // Using 'Task' as it's available in the project
        },
        priority: {
          name: priority
        }
      }
    };

    // Add labels if provided
    if (labels.length > 0) {
      issueData.fields.labels = labels;
    }

    // Create Basic Auth token
    const authToken = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');

    // Make API request
    const response = await fetch(`${jiraBaseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(issueData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Jira API error: ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();

    console.log(`✅ Jira ticket created: ${result.key}`);

    return {
      tool: 'create_jira_ticket',
      success: true,
      ticket_key: result.key,
      ticket_id: result.id,
      ticket_url: `${jiraBaseUrl}/browse/${result.key}`,
      title,
      priority,
      labels,
      affected_files
    };
  } catch (error) {
    console.error('❌ Failed to create Jira ticket:', error);
    throw new Error(`Failed to create Jira ticket: ${error.message}`);
  }
}
