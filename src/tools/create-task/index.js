/**
 * Create Task Tool
 * Creates a task in Focus (https://team.the-314.com).
 *
 * The Focus integrations endpoint only accepts { title, description }. The
 * project and assignee are resolved server-side from the bearer token, so the
 * bot never picks them. Any extra structured fields we collect (priority,
 * labels) are folded into the description so no context is lost.
 */

export const definition = {
  name: 'create_task',
  description: 'Create a task in Focus (project: Awkward Media) for bugs, issues, or feature requests. Use when user reports something that needs tracking.',
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
    const baseUrl = process.env.FOCUS_API_BASE_URL;
    const token = process.env.FOCUS_API_TOKEN;

    if (!baseUrl || !token) {
      console.error('❌ Focus API not configured (FOCUS_API_BASE_URL / FOCUS_API_TOKEN)');
      return '❌ Focus API not configured (missing FOCUS_API_BASE_URL or FOCUS_API_TOKEN)';
    }

    console.log(`🎫 Creating Focus task: "${title}"`);

    // Focus only stores title + description, so preserve everything else inline.
    const metaLines = [];
    if (priority) metaLines.push(`Priority: ${priority}`);
    if (labels && labels.length > 0) metaLines.push(`Labels: ${labels.join(', ')}`);

    let fullDescription = description;
    if (metaLines.length > 0) {
      fullDescription += `\n\n---\n${metaLines.join('\n')}`;
    }
    fullDescription += `\n\n_Created by BugBuster 3000 AI Agent_`;

    // Trim a trailing slash so the base URL joins cleanly with the path.
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/integrations/tasks`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, description: fullDescription })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ Focus API error (${response.status}):`, errorData);
      throw new Error(`Focus API error: ${response.status} - ${errorData}`);
    }

    // Response shape is owned by Focus; surface an id/url if it returns one,
    // but don't fail if the body is empty or shaped differently.
    let result = {};
    try {
      result = await response.json();
    } catch {
      // Non-JSON / empty body is fine — the task was still created (2xx).
    }

    const taskId = result.id || result.taskId || result.key || null;
    const taskUrl = result.url || result.link || null;

    console.log(`✅ Focus task created${taskId ? `: ${taskId}` : ''}`);

    let message = '✅ Task created in Focus!';
    if (taskId) message += `\n\nTask: ${taskId}`;
    if (taskUrl) message += `\nURL: ${taskUrl}`;
    message += `\nPriority: ${priority}\nTitle: ${title}`;
    return message;
  } catch (error) {
    console.error(`❌ Focus task creation failed:`, error.message);
    return `❌ Failed to create task: ${error.message}`;
  }
}
