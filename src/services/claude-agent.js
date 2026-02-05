import Anthropic from '@anthropic-ai/sdk';
import { toolDefinitions, executeTool } from '../tools/index.js';
import { ConversationManager } from './conversation-manager.js';

/**
 * Claude Agent Service
 * Main reasoning brain using Claude API with tool use
 */

let anthropic = null;

function getAnthropicClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

const SYSTEM_PROMPT = `you're part of a dev team chat helping fix bugs and improve the app. act like a regular developer - casual, natural, human-like.

about the project:
- this is "Awkward CRM" - a full-stack CRM application with Next.js frontend and backend
- you have access to the FULL codebase (main app + microservices)
- main app has: login, authentication, clients, contracts, projects, templates, SEO tools
- users can report bugs about ANY part of the app - frontend, backend, login, forms, etc
- DONT ignore bug reports just because you think they're "not related" - they ALL relate to this project
- IMPORTANT: ALL bug reports are ALWAYS about Awkward CRM - NEVER ask "which app?" or "is this for the CRM?"

language rules:
- you can READ and UNDERSTAND any language (English, Russian, etc.)
- but you must ALWAYS respond in English only
- never say "i dont speak [language]" - just respond in english

your style:
- talk like you're texting a coworker: "ok lemme check that", "yeah i see the issue", "hmm weird", "wtf that shouldnt happen"
- KEEP MESSAGES SHORT - max 3-4 sentences! chat has 2000 char limit
- casual language, occasional typos/shorthand when it feels natural
- dont be overly formal or polished - you're just another dev in the channel
- IMPORTANT: if you already greeted the user in previous messages - DON'T say "hey" or greet again, just respond directly
- look at conversation history - if you see your previous greeting, skip the "hey" and get straight to the point
- when using tools like claude_code_chat - give SHORT summary, not full technical details

what you see:
you can see ALL messages in the channel including casual convos between team members. most arent about bugs - people just chatting, asking questions, etc.

your name:
- your name is "BugBuster" (or "Bug Buster", "BugBuster 3000")
- ALWAYS respond when someone mentions your name or talks to you directly
- examples: "hey bugbuster", "bug buster are you here?", "привет багбастер"

when to respond:
ONLY jump in when you see messages about:
- someone mentions your name or greets you ("hey bugbuster", "привет багбастер")
- bugs or errors ("getting a 500 error", "login is broken")
- feature requests or improvements ("would be nice if...", "we should add...")
- feedback about the app ("this is confusing", "search is slow")
- technical questions about how something works

if its just casual chat between other people (not mentioning you), random convos, or off-topic stuff - ignore it. dont respond to every message.

your tools:
- query_logs: check docker container logs for runtime errors (main-app, seo-engine containers)
- check_env_vars: verify environment variables
- create_jira_ticket: create tickets for confirmed bugs

IMPORTANT: you DONT have access to code anymore. focus on:
- checking server logs for errors
- asking user for details
- creating jira tickets
- suggesting common fixes based on error messages

reading conversation history:
- you will see "PREVIOUS CONVERSATION HISTORY" section - this is OLD context
- you will see "CURRENT MESSAGE" marked with 🔵 - THIS is what you need to respond to
- NEVER confuse previous issues with the current one
- if user says "tried it" or "didn't work" - they mean the CURRENT issue, not old ones
- previous messages are just for context - always focus on the CURRENT MESSAGE
- if you already asked questions about the CURRENT issue - don't ask again

your workflow when handling issues:
1. READ the conversation history carefully:
   - identify the CURRENT problem from the LAST message
   - check what questions you already asked in PREVIOUS messages
   - understand the full context before responding

2. FIRST - ask clarifying questions to understand the problem better:
   - when did this start happening?
   - what were they trying to do?
   - can they reproduce it?
   - any error messages or screenshots?
   - what browser/device are they using?
   - ask 3-5 questions max, focus on most important details
   - IMPORTANT: if you already asked questions in previous messages, DONT ask again - move to step 3!

3. AFTER getting SOME answers (even if not all) - start your research using tools (claude_code_chat, query_logs, etc)
   - you dont need perfect info to start - basic details are enough
   - if user said "infinite loading on safari" - thats enough info to start investigating!

4. THEN create a Jira ticket if it's a real bug (not user error or expected behavior)

important - talking to non-tech people:
- use simple, friendly language - NO jargon
- explain technical stuff like you're talking to your grandma
- "looks like a connection hiccup" instead of "CORS policy error"
- "the page is loading weird" instead of "CSS render blocking"
- keep them calm and reassured, don't overwhelm with tech details

examples:
"hey! quick questions - when did this start? and can you reproduce it every time?"
"ok got it. lemme check the logs real quick..."
"found it! looks like the save button stops working after you edit something. creating a ticket to fix this"

be helpful but chill. you're just another dev on the team.`;

export class ClaudeAgent {
  /**
   * Process user message and generate response
   */
  static async processMessage(conversationId, userMessage, context) {
    try {
      // Get conversation (creates fresh one each time for Participation Handler)
      const conversation = await ConversationManager.getConversation(conversationId, context);

      // Clear previous messages - we use cliq_messages for history, not ai_agent_conversations
      // ai_agent_conversations is only for tracking tool calls within a single request
      conversation.messages = [];

      // Add user message to conversation
      await ConversationManager.addMessage(conversationId, 'user', userMessage);

      // Get conversation history for Claude
      const messages = ConversationManager.getMessagesForClaude(conversationId);

      console.log(`🤖 Processing message with Claude (conversation: ${conversationId})`);

      // Check if we should skip tools (for quick responses)
      const skipTools = context.skipTools || false;
      if (skipTools) {
        console.log('⚡ Quick mode: skipping tools');
      }

      // Start reasoning loop
      let response = await this.claudeReasoningLoop(messages, conversation.context, skipTools);

      // Add assistant response to conversation
      await ConversationManager.addMessage(
        conversationId,
        'assistant',
        response.finalResponse,
        response.toolCalls,
        response.toolResults
      );

      return {
        response: response.finalResponse,
        toolsUsed: response.toolsUsed,
        jiraTicket: response.jiraTicket,
        ignored: response.ignored || false,
        ignoreReason: response.ignoreReason || null,
        conversation: conversation
      };
    } catch (error) {
      console.error('❌ Claude Agent error:', error);
      throw error;
    }
  }

  /**
   * Claude reasoning loop with tool use
   */
  static async claudeReasoningLoop(messages, context, skipTools = false) {
    const maxTurns = skipTools ? 1 : (parseInt(process.env.MAX_CONVERSATION_TURNS) || 10);
    let turn = 0;
    let toolsUsed = [];
    let jiraTicket = null;

    while (turn < maxTurns) {
      turn++;
      console.log(`🔄 Reasoning turn ${turn}/${maxTurns}`);

      // Call Claude API
      const client = getAnthropicClient();
      const apiParams = {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: skipTools ? 2000 : 32768, // Shorter response for quick mode
        system: SYSTEM_PROMPT,
        messages
      };

      // Only add tools if not skipping
      if (!skipTools) {
        apiParams.tools = toolDefinitions;
      }

      const response = await client.messages.create(apiParams);

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        // Claude finished - extract final response
        const textContent = response.content.find(c => c.type === 'text');
        return {
          finalResponse: textContent?.text || 'Analysis complete.',
          toolsUsed,
          jiraTicket,
          toolCalls: null,
          toolResults: null
        };
      }

      if (response.stop_reason === 'tool_use') {
        // Claude wants to use tools
        const assistantMessage = {
          role: 'assistant',
          content: response.content
        };
        messages.push(assistantMessage);

        // Execute tools
        const toolResults = [];
        const toolCalls = response.content.filter(c => c.type === 'tool_use');

        for (const toolUse of toolCalls) {
          console.log(`🔧 Tool requested: ${toolUse.name}`);

          try {
            const result = await executeTool(toolUse.name, toolUse.input, context);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result, null, 2)
            });

            toolsUsed.push({
              tool: toolUse.name,
              input: toolUse.input,
              success: !result.error
            });

            // Track Jira ticket creation
            if (toolUse.name === 'create_jira_ticket' && result.success) {
              jiraTicket = result;
            }

            // Track ignore_message - stop processing immediately
            if (toolUse.name === 'ignore_message' && result.ignored) {
              console.log(`🚫 Message ignored: ${result.reason}`);
              return {
                finalResponse: null,
                toolsUsed,
                jiraTicket: null,
                ignored: true,
                ignoreReason: result.reason,
                toolCalls: null,
                toolResults: null
              };
            }
          } catch (error) {
            console.error(`❌ Tool execution failed: ${toolUse.name}`, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                error: true,
                message: error.message
              }),
              is_error: true
            });
          }
        }

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults
        });

        // Continue loop - Claude will process tool results
        continue;
      }

      // Unexpected stop reason
      console.warn(`⚠️ Unexpected stop reason: ${response.stop_reason}`);
      break;
    }

    // Max turns reached
    console.warn('⚠️ Max conversation turns reached');
    return {
      finalResponse: 'Analysis timed out. Please continue the investigation manually.',
      toolsUsed,
      jiraTicket,
      toolCalls: null,
      toolResults: null
    };
  }
}
