# AI Support Agent

AI-powered support agent that analyzes bug reports from Zoho Cliq, investigates code, and creates detailed Jira tickets.

## Architecture

This is a **hybrid AI agent** combining two AI systems:

1. **Claude API (Sonnet 4.5)** - Main reasoning brain with tool use
2. **Claude Code CLI** - Deep code analysis for complex investigations

### System Flow

```
Cliq Message → Webhook → Claude Agent → Tools → Response
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
              Claude API          Claude Code CLI
              (reasoning)         (code analysis)
                    │                   │
                    └─────────┬─────────┘
                              ↓
                    Jira Ticket Created
```

## Features

### 🔧 Available Tools

1. **search_code** - Search code using ripgrep/grep
2. **read_file** - Read file contents (full or partial)
3. **git_log** - View commit history
4. **git_diff** - Show changes between commits
5. **query_logs** - Query Docker container logs
6. **list_files** - List files in directory
7. **check_env_vars** - Verify environment variables
8. **ask_user** - Ask clarifying questions in Cliq
9. **run_claude_code** - Run Claude Code CLI for deep analysis
10. **create_jira_ticket** - Create detailed Jira ticket

### 🤖 Agent Capabilities

- **Code Analysis**: Search and read repository code
- **Git Investigation**: Check commit history and diffs
- **Log Analysis**: Query Docker container logs for errors
- **Environment Verification**: Check if env vars are configured
- **Interactive Questioning**: Ask users for clarification
- **Deep Code Analysis**: Use Claude Code CLI for complex investigations
- **Jira Integration**: Create detailed bug tickets automatically

## Setup

### Prerequisites

- Node.js 20+
- Docker (for deployment)
- Anthropic API key (Claude)
- Zoho Cliq bot token
- Jira API credentials
- GitHub Personal Access Token

### Environment Variables

Create `.env` file (see `.env.example`):

```bash
# Server
PORT=3002
NODE_ENV=development

# Claude API
ANTHROPIC_API_KEY=your_key_here

# Supabase (for state management)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_key_here

# Cliq Integration
CLIQ_WEBHOOK_SECRET=your_secret
CLIQ_API_TOKEN=your_token
CLIQ_BOT_NAME=AI Support Agent

# Jira Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_jira_token
JIRA_PROJECT_KEY=PROJ

# GitHub (for code access)
GITHUB_TOKEN=your_github_pat
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=your-repo
GITHUB_REPO_BRANCH=main

# Repository clone path
REPO_CLONE_PATH=/tmp/repo-clone

# Docker logs access
DOCKER_HOST=unix:///var/run/docker.sock
MAIN_APP_CONTAINER_NAME=awkward-crm-app
SEO_ENGINE_CONTAINER_NAME=awkward-crm-seo-engine

# Agent configuration
MAX_CONVERSATION_TURNS=10
TOOL_EXECUTION_TIMEOUT=30000
```

### Local Development

1. Install dependencies:
```bash
cd ai_agent
npm install
```

2. Clone repository for code analysis:
```bash
git clone https://github.com/your-org/your-repo.git /tmp/repo-clone
```

3. Start service:
```bash
npm run dev
```

4. Service will be available at `http://localhost:3002`

### Database Setup

Run migration to create conversations table:

```bash
# Apply migration 015_ai_agent_conversations.sql to your Supabase database
```

## Cliq Integration

### Setting up Cliq Webhook

1. **Create Bot in Cliq:**
   - Go to Zoho Cliq → Bots
   - Create new bot "AI Support Agent"
   - Get bot token

2. **Configure Webhook:**
   - Bot Settings → Incoming Webhook
   - URL: `https://your-domain.com/webhook/cliq`
   - Secret: Generate secure secret
   - Events: Message created

3. **Add Bot to Channel:**
   - Add bot to your support channel
   - Bot will listen to all messages

### Message Flow

1. User posts bug report in Cliq channel
2. Webhook receives message → validates signature
3. Agent reacts with 👀 (processing)
4. Claude analyzes message using tools
5. Agent responds with findings
6. If confirmed bug → creates Jira ticket
7. Agent reacts with ✅ (complete)

## Jira Integration

### Ticket Format

Jira tickets created by agent include:

```markdown
## Problem Statement
[Clear description of the bug]

## Root Cause
[Analysis of what's causing the bug]

## Affected Files
• path/to/file1.ts:42
• path/to/file2.tsx:158

## Reproduction Steps
1. [Step 1]
2. [Step 2]

## Possible Fix
[Suggested solution]

## Evidence
- Last working version: commit abc123
- Error logs: [relevant logs]
- Code analysis: [findings]

---
_Created by AI Support Agent_
```

### Ticket Metadata

- **Type**: Bug
- **Priority**: Set by agent (Highest/High/Medium/Low/Lowest)
- **Labels**: Automatically tagged (bug, backend, urgent, etc.)
- **Affected Files**: Listed in description

## Deployment

### Docker Deployment

Build and run:

```bash
docker build -t ai-agent:latest ./ai_agent
docker run -d \
  --name awkward-crm-ai-agent \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/repo:/opt/repo:ro \
  --env-file .env \
  ai-agent:latest
```

### GitHub Actions Deployment

Deployment is automated via `.github/workflows/deploy-ai-agent.yml`:

- **Trigger**: Push to `main` with changes in `ai_agent/`
- **Manual**: Can be triggered via GitHub Actions UI
- **Server**: Deploys to main app server (same as main CRM)

### Required Secrets

Add to GitHub repository secrets:

```
ANTHROPIC_API_KEY
CLIQ_WEBHOOK_SECRET
CLIQ_API_TOKEN
JIRA_BASE_URL
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_PROJECT_KEY
GH_PAT (GitHub Personal Access Token)
```

## Usage Examples

### Example 1: User Reports Bug

**User in Cliq:**
> "PDF export stopped working after yesterday's update. Getting 500 error."

**Agent Response:**
```
🔍 Analyzing your issue...

I've investigated the PDF export issue. Here's what I found:

**Root Cause:**
In commit abc123 (yesterday), the PDF generation library was updated from v1.2 to v2.0.
The new version requires a different initialization method.

**Affected Files:**
• src/api/pdf/route.ts:42 - Missing await on PDF.create()
• src/lib/pdf-generator.ts:18 - Old initialization method

**Fix:**
Change line 42 in route.ts from:
`const pdf = PDF.create(options)`
to:
`const pdf = await PDF.create(options)`

✅ **Jira Ticket Created:** [PROJ-1234](https://your-domain.atlassian.net/browse/PROJ-1234)

---
_Tools used:_
• search_code
• read_file
• git_log
• git_diff
• query_logs
• create_jira_ticket
```

### Example 2: Clarification Needed

**User:**
> "App is slow"

**Agent:**
```
❓ **Question:**

I need more details to investigate. Which part of the app is slow?

**Options:**
1. Page loading
2. API requests
3. Search functionality
4. Dashboard rendering
5. Other

_Reply with the number or your own answer._
```

**User:**
> "3. Search"

**Agent:**
```
🔍 Running analysis on search functionality...

[Continues investigation...]
```

## Monitoring

### Health Check

```bash
curl http://localhost:3002/health
```

Response:
```json
{
  "status": "healthy",
  "service": "AI Agent",
  "features": {
    "claudeAPI": "enabled",
    "claudeCodeCLI": "enabled",
    "cliqIntegration": "enabled",
    "jiraIntegration": "enabled",
    "githubAccess": "enabled",
    "dockerLogs": "enabled"
  }
}
```

### Detailed Health

```bash
curl http://localhost:3002/health/detailed
```

### Logs

```bash
# Docker logs
docker logs awkward-crm-ai-agent

# Follow logs
docker logs -f awkward-crm-ai-agent
```

## Troubleshooting

### Agent Not Responding

1. Check service is running: `docker ps | grep ai-agent`
2. Check health: `curl http://localhost:3002/health`
3. Check logs: `docker logs awkward-crm-ai-agent`
4. Verify Cliq webhook is configured correctly

### Jira Tickets Not Created

1. Verify `JIRA_API_TOKEN` is valid
2. Check `JIRA_PROJECT_KEY` exists
3. Ensure Jira user has permission to create bugs
4. Check logs for Jira API errors

### Code Analysis Failing

1. Verify repository clone exists at `REPO_CLONE_PATH`
2. Check `GITHUB_TOKEN` has read access
3. Ensure ripgrep is installed: `docker exec awkward-crm-ai-agent which rg`
4. Verify git is installed: `docker exec awkward-crm-ai-agent which git`

### Docker Logs Not Accessible

1. Verify `/var/run/docker.sock` is mounted
2. Check Docker socket permissions
3. Ensure container names match: `MAIN_APP_CONTAINER_NAME`, `SEO_ENGINE_CONTAINER_NAME`

## Architecture Details

### Conversation State Management

- **Storage**: Supabase PostgreSQL
- **Caching**: In-memory Map for active conversations
- **Cleanup**: Auto-close after 24h of inactivity
- **Thread Support**: Maintains context across message threads

### Tool Execution

- **Timeout**: 30s per tool (configurable)
- **Error Handling**: Graceful failures with error reporting
- **Security**: Path traversal prevention, signature verification
- **Rate Limiting**: Can be added via middleware

### Claude API Usage

- **Model**: claude-sonnet-4-5-20250929
- **Max Tokens**: 4096 per response
- **Tool Use**: Native Anthropic tool use format
- **Reasoning Loop**: Max 10 turns (configurable)

### Security

- **Webhook Signature**: HMAC-SHA256 verification
- **Secrets**: Environment variables only
- **RLS**: Row Level Security on conversations table
- **Read-Only Repo**: Repository mounted as read-only volume
- **Docker Socket**: Access limited to log reading only

## Development

### Adding New Tools

1. Create tool file in `src/tools/your-tool.js`
2. Implement tool function with proper error handling
3. Add tool definition to `src/tools/index.js`
4. Export tool in `executeTool()` switch statement
5. Test with Cliq or direct API call

### Testing

```bash
# Run tests (when implemented)
npm test

# Manual testing via Cliq
# Post message in configured channel
```

## Cost Estimation

**Per Bug Report (average):**
- Claude API: ~$0.05 - $0.15 (depending on complexity)
- Tool executions: Free (local operations)
- Storage: Minimal (conversations are small)

**Monthly (100 bug reports):**
- Estimated cost: $5 - $15

## Roadmap

- [ ] Add automated tests
- [ ] Implement rate limiting
- [ ] Add metrics and analytics
- [ ] Support multiple Cliq channels
- [ ] GitHub PR creation for fixes
- [ ] Slack integration
- [ ] Web dashboard for monitoring

## Support

For issues or questions:
1. Check logs: `docker logs awkward-crm-ai-agent`
2. Review health: `http://localhost:3002/health/detailed`
3. Check GitHub Issues
4. Contact: sasha@awkward-media.com
