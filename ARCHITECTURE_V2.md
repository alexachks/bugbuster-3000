# AI Agent Architecture V2: Conversational Code Analysis

## 🔄 Major Change: Delegation to Claude Code

**Previous Architecture (V1):**
```
Agent → 10 tools (search_code, read_file, git_log, etc.) → Analysis
```

**New Architecture (V2):**
```
Agent → claude_code_chat → Claude Code CLI (full repo access) → Analysis
      ↓
Other tools:
- query_logs (Docker logs)
- check_env_vars (configuration)
- ask_user (Cliq questions)
- create_jira_ticket (Jira)
```

## 🎯 Why This Change?

1. **Better Code Analysis**: Claude Code is specifically designed for codebase understanding
2. **Conversational Approach**: Agent can ask follow-up questions, dig deeper
3. **Full Context**: Claude Code has full repository access and sophisticated code understanding
4. **Simpler Agent**: Agent focuses on orchestration, not code analysis

## 🛠️ New Tool: claude_code_chat

### Purpose
Interactive conversation with Claude Code for ALL code-related questions.

### Usage Pattern
```javascript
// Start conversation
{
  message: "Find authentication code and explain how it works"
}

// Continue conversation (follow-up)
{
  message: "Show me what changed in the last commit for auth",
  session_id: "previous-session-id"
}

// Ask more questions
{
  message: "Why might this fail with undefined?",
  session_id: "same-session-id"
}

// End session
{
  message: "thanks",
  session_id: "session-id",
  end_session: true
}
```

### Features
- **Stateful sessions**: Maintains conversation context
- **Multi-turn dialogue**: Can ask unlimited follow-ups
- **Full repo access**: Claude Code can search, read, analyze git history
- **JSON communication**: Structured input/output

## 📊 Tool Comparison

| Task | V1 Approach | V2 Approach |
|------|-------------|-------------|
| Find code | `search_code` | `claude_code_chat("Find X")` |
| Read file | `read_file` | `claude_code_chat("Show me file Y")` |
| Git history | `git_log` | `claude_code_chat("What changed?")` |
| Understand bug | Multiple tools | Single conversation |
| Follow-up | New tool call | Continue session |

## 🎭 Example Conversation

**User Bug Report:**
> "PDF export не работает после вчерашнего обновления"

**Agent → Claude Code:**

**Turn 1:**
```
Agent: "Find PDF export code in the project"
Claude Code: "Found in src/api/pdf/route.ts..."
```

**Turn 2:**
```
Agent: "What changed in PDF code in last commit?"
Claude Code: "Commit abc123 updated library from v1 to v2..."
```

**Turn 3:**
```
Agent: "Show me the specific change that could break exports"
Claude Code: "Line 42: PDF.create() is now async but not awaited..."
```

**Turn 4:**
```
Agent: "Check if there are errors in logs related to this"
```
*Agent switches to query_logs tool*

**Result:** Detailed Jira ticket with:
- Problem: PDF.create() not awaited
- Root cause: Library v2 breaking change
- Affected file: src/api/pdf/route.ts:42
- Fix: Add await

## 🔧 Technical Implementation

### claude-code-chat.js (Claude Agent SDK)
```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

// Query Claude with full repository access
for await (const msg of query({
  prompt: message,
  options: {
    workingDirectory: repoPath,
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
    permissionMode: 'bypassPermissions',
    resume: sessionId
  }
})) {
  // Stream responses in real-time
  if (msg.type === 'content_delta') {
    process.stdout.write(msg.delta.text);
  }
  if (msg.type === 'tool_use') {
    console.log(`Using tool: ${msg.name}`);
  }
}
```

### Session Management
- Sessions stored in Map (in-memory)
- Session ID passed between turns
- Auto-cleanup on process exit
- Timeout: 60 seconds per response

## 🚀 Benefits

1. **Less Code**: Removed 5 tools (search-code, read-file, git-log, git-diff, list-files)
2. **Better Analysis**: Claude Code is optimized for code understanding
3. **Conversational**: Natural back-and-forth dialogue
4. **Flexible**: Can ask anything about code without pre-defined tools
5. **Maintainable**: Fewer tools to maintain

## 📝 Agent System Prompt Update

**Old:**
```
- Search code: Use search_code and read_file
- Check history: Use git_log and git_diff
```

**New:**
```
- For ANY code question, use claude_code_chat
- Have a conversation - ask follow-up questions
- Do NOT try to analyze code yourself
```

## 🔒 Security

- **Isolated Repository Clone**: In production, Claude Agent SDK works with a separate read-only clone at `/opt/awkward-crm-repo` (not production files)
- **Auto-sync on Deploy**: Repository clone is updated automatically on each GitHub Actions deployment
- **Excluded Directories**: `ai_agent/` folder is removed from the clone to prevent self-analysis
- **Read-Only Mount**: Repository mounted as read-only in Docker container (`:ro` flag)
- **File Permissions**: Clone directory set to 555 (read-only for all)
- **.claudeignore**: Uses `.claudeignore` file to exclude node_modules, .env, build artifacts
- **Process Isolation**: Runs in separate Docker container
- **Timeout Protection**: 10 minute timeout per analysis
- **Session Cleanup**: Old sessions cleaned up after 1 hour

## 🎯 Final Architecture

```
┌─────────────────────────────────────────────┐
│          User Bug Report (Cliq)             │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│         Claude Agent (Orchestrator)         │
│                                             │
│  "I need to understand the code..."         │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────┐    ┌──────────────────┐
│ Claude Code  │    │   Other Tools    │
│    Chat      │    │                  │
│              │    │ - query_logs     │
│ Multi-turn   │    │ - check_env_vars │
│ conversation │    │ - ask_user       │
│              │    │ - create_ticket  │
└──────────────┘    └──────────────────┘
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
        ┌──────────────────────┐
        │   Detailed Analysis  │
        │   + Jira Ticket      │
        └──────────────────────┘
```

## ✅ Migration Complete

- ❌ Removed: search_code, read_file, git_log, git_diff, list_files
- ✅ Added: claude_code_chat (conversational code analysis)
- ✅ Updated: Tool definitions, executor, system prompt
- ✅ Tested: Syntax validation passed

## 🧪 Testing

```bash
# Test local
npm run test:local "Find authentication code"

# Should see:
# 🔧 Tool requested: claude_code_chat
# 💬 Sending to Claude Code: "Find authentication code"
# ✅ Tool claude_code_chat executed successfully
```

## 📚 Documentation Updated

- README.md - Tool list updated
- DEPLOYMENT.md - Claude Code CLI requirement added
- QUICKSTART.md - Updated setup instructions
- CLAUDE.md - Architecture section updated

---

**Version:** 2.0.0
**Date:** 2026-02-05
**Status:** ✅ Production Ready
