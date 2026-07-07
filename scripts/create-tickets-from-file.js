/**
 * Bulk create Focus tasks from chat messages file
 *
 * Usage:
 * node create-tickets-from-file.js messages.md
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FOCUS_API_BASE_URL = process.env.FOCUS_API_BASE_URL;
const FOCUS_API_TOKEN = process.env.FOCUS_API_TOKEN;

// Read messages from file
async function readMessagesFromFile(filePath) {
  console.log(`📥 Reading messages from file: ${filePath}...`);
  const content = await fs.readFile(filePath, 'utf-8');
  console.log(`✅ Read ${content.length} characters`);
  return content;
}

// Ask Claude to extract bug reports from messages
async function extractBugReports(messagesText) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const prompt = `Analyze this chat conversation and extract all bug reports, issues, and feature requests.

For each issue, provide:
- summary (short title, max 100 chars)
- description (what happened, who reported it, any error messages or context)
- reporter (who reported it - from the username in the chat)
- priority (High/Medium/Low based on urgency mentioned)

IMPORTANT RULES:
1. Extract REAL issues from the conversation - things users reported as broken, errors, slowness, missing features
2. Do NOT create tickets for:
   - Casual conversation (greetings, thanks, etc)
   - Test messages (like "123", "test", "are you here")
   - Fixed issues (if someone says "fixed" or "works now" in the same thread)
   - Meta discussion about the bot itself
3. Include context about WHICH projects/features are affected if mentioned
4. If an issue was already created (you see AM-XX ticket numbers), don't duplicate it

Chat messages:
${messagesText}

Return ONLY valid JSON array like:
[
  {
    "summary": "Error syncing competitors from SERP Analysis",
    "description": "User reported: Error syncing competitors from SERP Analysis (Griffin Deck & Covers project). Reported by Inza Khan on Jan 30.",
    "reporter": "Inza Khan",
    "priority": "High"
  }
]

If no NEW issues found (all are either fixed or already ticketed), return empty array: []`;

  console.log('🤖 Analyzing messages with Claude...');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const text = response.content[0].text;

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('⚠️  No JSON found in response');
    console.log('Response:', text);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('❌ Failed to parse JSON:', e.message);
    console.log('JSON text:', jsonMatch[0]);
    return [];
  }
}

// Create Focus task
// Focus only accepts { title, description }; project/assignee come from the token.
// Fold priority + reporter into the description so nothing is lost.
async function createFocusTask(issue) {
  const metaLines = [];
  if (issue.priority) metaLines.push(`Priority: ${issue.priority}`);
  if (issue.reporter) metaLines.push(`Reporter: ${issue.reporter}`);

  let description = issue.description;
  if (metaLines.length > 0) {
    description += `\n\n---\n${metaLines.join('\n')}`;
  }

  const endpoint = `${FOCUS_API_BASE_URL.replace(/\/+$/, '')}/api/integrations/tasks`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FOCUS_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: issue.summary, description })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create task: ${response.status} - ${error}`);
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Empty / non-JSON body still means success (2xx).
  }
  return data.id || data.taskId || data.key || 'created';
}

// Main
async function main() {
  const filePath = process.argv[2] || 'messages.md';

  // Read messages
  const messagesText = await readMessagesFromFile(filePath);

  // Extract issues
  const issues = await extractBugReports(messagesText);
  console.log(`✅ Extracted ${issues.length} issues\n`);

  if (issues.length === 0) {
    console.log('No new issues found. Exiting.');
    return;
  }

  console.log('📋 Issues found:');
  issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. [${issue.priority}] ${issue.summary} (by ${issue.reporter})`);
  });

  console.log('\n🎫 Creating Focus tasks...');
  for (const issue of issues) {
    try {
      const taskId = await createFocusTask(issue);
      console.log(`  ✅ Created ${taskId}: ${issue.summary}`);
    } catch (error) {
      console.error(`  ❌ Failed to create task for "${issue.summary}":`, error.message);
    }
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
