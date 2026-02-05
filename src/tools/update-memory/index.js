/**
 * Update Memory Tool
 * Allows agent to save learnings and preferences
 */

import fs from 'fs';
import path from 'path';

const MEMORY_FILE = path.resolve(process.cwd(), 'agent-memory.md');

export const definition = {
  name: 'update_memory',
  description: 'Save important learnings, patterns, or preferences to memory. Use this when you learn something useful that should be remembered for future conversations.',
  input_schema: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'The learning or pattern to remember (concise, actionable)'
      },
      category: {
        type: 'string',
        enum: ['jira', 'debugging', 'user-preferences', 'common-issues', 'workflow'],
        description: 'Category for this memory'
      }
    },
    required: ['note', 'category']
  }
};

export async function execute({ note, category }) {
  try {
    // Read existing memory or create new
    let memory = '';
    if (fs.existsSync(MEMORY_FILE)) {
      memory = fs.readFileSync(MEMORY_FILE, 'utf-8');
    } else {
      memory = `# BugBuster Memory\n\nThings I've learned while helping the team.\n\n`;
    }

    // Find or create category section
    const categoryHeader = `## ${category}`;
    const timestamp = new Date().toISOString().split('T')[0];
    const newEntry = `- [${timestamp}] ${note}`;

    if (memory.includes(categoryHeader)) {
      // Add to existing category
      const lines = memory.split('\n');
      let categoryIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === categoryHeader) {
          categoryIndex = i;
          break;
        }
      }

      // Find next section or end
      let insertIndex = categoryIndex + 1;
      for (let i = categoryIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) {
          insertIndex = i;
          break;
        }
        insertIndex = i + 1;
      }

      lines.splice(insertIndex, 0, newEntry);
      memory = lines.join('\n');
    } else {
      // Create new category
      memory += `\n${categoryHeader}\n${newEntry}\n`;
    }

    // Write back
    fs.writeFileSync(MEMORY_FILE, memory, 'utf-8');

    console.log(`💾 Memory updated: [${category}] ${note}`);
    return `✅ Saved to memory`;
  } catch (error) {
    console.error(`❌ Memory update failed:`, error.message);
    return `❌ Failed to save: ${error.message}`;
  }
}
