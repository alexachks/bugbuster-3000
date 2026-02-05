# BugBuster 3000 - AI Support Agent

AI-powered support agent for Zoho Cliq that helps developers investigate bugs, analyze code, and create Jira tickets - powered by **Claude Agent SDK**.

## What It Does

BugBuster 3000 works like **Claude Code in your Cliq channel**:

- 💬 **Multi-turn conversations** - remembers context across messages
- 🔍 **Code analysis** - full access to your repository
- 📊 **Log investigation** - checks Docker container logs
- 🎫 **Jira integration** - creates detailed bug tickets
- 👥 **Group chat ready** - works with multiple users simultaneously

## Architecture

Built on **Claude Agent SDK V2** for autonomous, conversational behavior:

```
Cliq Message → Participation Handler → Agent SDK Session
                                           ↓
                                  Persistent conversation
                                  (never expires)
                                           ↓
                                  Streaming responses
                                           ↓
                                  Incoming Webhook → Cliq
```

**Key features:**
- **One session per channel** - maintains full conversation context
- **Sessions never expire** - agent always remembers previous discussions
- **Streaming updates** - sends multiple messages while working
- **Built-in code tools** - Read, Grep, Glob, Edit from Claude Code
- **Custom MCP tools** - query_logs, create_jira_ticket, check_env_vars

## Setup

### Prerequisites

- Node.js 20+
- Docker (for log access)
- Anthropic API key
- Zoho Cliq bot with Incoming Webhook configured
- Jira API credentials
- Cloned repository for code analysis

### Environment Variables

Create `.env` file (see `.env.example`):

```bash
# Claude Agent SDK
ANTHROPIC_API_KEY=sk-ant-xxx

# Cliq Integration
CLIQ_BOT_WEBHOOK_URL=https://cliq.zoho.com/api/v2/bots/your-bot/incoming?zapikey=xxx
CLIQ_BOT_NAME=BugBuster 3000

# Jira Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_jira_token
JIRA_PROJECT_KEY=PROJ

# Repository for code analysis
REPO_CLONE_PATH=/tmp/awkward-crm-repo

# Docker containers
MAIN_APP_CONTAINER_NAME=awkward-crm-app
SEO_ENGINE_CONTAINER_NAME=awkward-crm-seo-engine

# Server
PORT=3002
NODE_ENV=development
```

### Installation

```bash
npm install
```

### Clone Repository

```bash
# Clone your repository for code analysis
git clone https://github.com/your-org/your-repo.git /tmp/awkward-crm-repo
```

### Start Service

```bash
npm run dev
```

Service will be available at `http://localhost:3002`

## Cliq Integration

### Setting up the Bot

1. **Create Bot in Cliq:**
   - Go to Zoho Cliq → Bots
   - Create new bot "BugBuster 3000"

2. **Configure Incoming Webhook:**
   - Bot Settings → Incoming Webhook
   - Copy the webhook URL
   - Add to `.env` as `CLIQ_BOT_WEBHOOK_URL`

3. **Configure Participation Handler:**
   - Bot Settings → Bot Functions → Participation Handler
   - Add this Deluge code:

```javascript
response = Map();
response.put("text", ""); // Don't respond directly
return response;
```

   - Set webhook URL: `https://your-domain.com/webhook/cliq/participate`

4. **Add Bot to Channel:**
   - Add bot to your support/dev channel
   - Bot will listen to all messages and respond when needed

### How It Works

**In the Cliq channel:**

```
User: hey bugbuster, login is broken
Bot: ok lemme check. what browser?
User: safari
Bot: 🔍 checking safari specific issues...
Bot: 📊 found CORS error in logs
Bot: ✅ created ticket PROJ-123
```

**Behind the scenes:**
1. Participation Handler receives message
2. Agent SDK session processes it (with full context)
3. Agent can use tools: Read, Grep, query_logs, etc.
4. Responses streamed back via Incoming Webhook
5. Session persists - agent remembers everything

## Custom Tools

BugBuster has these custom MCP tools:

### `query_logs`

Query Docker container logs:

```javascript
{
  container: "main-app" | "seo-engine",
  query: "error",  // optional grep filter
  tail: 100        // optional line count
}
```

### `create_jira_ticket`

Create Jira bug ticket:

```javascript
{
  title: "Login fails on Safari",
  description: "Detailed markdown description...",
  priority: "High",
  labels: ["bug", "frontend"],
  affected_files: ["src/auth/login.ts"]
}
```

### `check_env_vars`

Verify environment variables:

```javascript
{
  service: "main-app",
  var_names: ["DATABASE_URL", "API_KEY"]
}
```

Plus all built-in Claude Code tools: Read, Write, Edit, Grep, Glob, Bash, etc.

## Deployment

### Docker

```bash
docker build -t bugbuster-3000:latest .
docker run -d \
  --name bugbuster-3000 \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/repo:/opt/repo:ro \
  --env-file .env \
  bugbuster-3000:latest
```

### Health Checks

```bash
# Service health
curl http://localhost:3002/health

# Cliq integration health
curl http://localhost:3002/webhook/cliq/health
```

Response:
```json
{
  "status": "healthy",
  "service": "Cliq Integration",
  "agent_sdk": {
    "active_sessions": 2,
    "channels": ["C123456", "C789012"]
  },
  "webhook_configured": true
}
```

## Development

### Project Structure

```
src/
├── server.js                    # Express app
├── routes/
│   ├── cliq.js                  # Cliq participation handler
│   └── health.js                # Health checks
├── services/
│   └── agent-sdk-manager.js     # Agent SDK session manager
└── tools/
    └── sdk-tools.js             # Custom MCP tools
```

### Key Files

- **[agent-sdk-manager.js](src/services/agent-sdk-manager.js)** - Session management (one per channel, never expires)
- **[sdk-tools.js](src/tools/sdk-tools.js)** - Custom MCP tools implementation
- **[cliq.js](src/routes/cliq.js)** - Participation handler + webhook messaging

### Adding New Tools

Create new MCP tool in `src/tools/sdk-tools.js`:

```javascript
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const myTool = tool(
  'my_tool',
  'Description of what this tool does',
  {
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional()
  },
  async (args) => {
    // Your implementation
    return {
      content: [{
        type: 'text',
        text: 'Result'
      }]
    };
  }
);

// Add to mcpServer.tools array
export const mcpServer = createSdkMcpServer({
  tools: [myTool, ...]
});
```

## Monitoring

View active sessions and channels:

```bash
curl http://localhost:3002/webhook/cliq/health
```

Check logs:

```bash
# Docker
docker logs -f bugbuster-3000

# Local
npm run dev
```

## Cost Estimation

Using Claude Sonnet 4.5:

**Per conversation (average):**
- Simple query: ~$0.01 - $0.05
- Code investigation: ~$0.10 - $0.30
- Deep analysis with multiple tools: ~$0.50 - $1.00

**Monthly (100 investigations):**
- Estimated: $10 - $50

Sessions persist forever, so context builds up over time (lower per-message cost).

## Troubleshooting

### Bot Not Responding

1. Check service: `docker ps | grep bugbuster`
2. Check health: `curl http://localhost:3002/health`
3. Check logs: `docker logs bugbuster-3000`
4. Verify `CLIQ_BOT_WEBHOOK_URL` is configured
5. Test webhook manually

### Messages Not Reaching Cliq

1. Verify Incoming Webhook URL in `.env`
2. Test webhook:
   ```bash
   curl -X POST $CLIQ_BOT_WEBHOOK_URL \
     -H "Content-Type: application/json" \
     -d '{"text": "test", "channel_id": "C123456"}'
   ```
3. Check Cliq Deluge routing script

### Code Analysis Failing

1. Verify repository clone: `ls -la $REPO_CLONE_PATH`
2. Check permissions: Agent SDK needs read access
3. Ensure tools are enabled in session config

### Docker Logs Not Accessible

1. Verify `/var/run/docker.sock` is mounted
2. Check container names match env vars
3. Test: `docker logs $MAIN_APP_CONTAINER_NAME`

## Technical Details

### Agent SDK Configuration

Session created with:

```javascript
unstable_v2_createSession({
  model: 'claude-sonnet-4-5-20250929',
  systemPrompt: SYSTEM_PROMPT,
  cwd: REPO_CLONE_PATH,
  mcpServers: { 'cliq-tools': mcpServer },
  tools: { type: 'preset', preset: 'claude_code' },
  permissionMode: 'bypassPermissions'
})
```

### Session Management

- **Lifetime**: Permanent (never expires)
- **Scope**: One session per Cliq channel ID
- **Storage**: In-memory Map (sessions lost on restart)
- **Context**: Full conversation history maintained by Agent SDK

### Message Flow

1. Cliq → Participation Handler (`POST /webhook/cliq/participate`)
2. Quick 200 response (avoid Deluge timeout)
3. Async: `session.send(userName + ": " + message)`
4. Async: `for await (msg of session.stream())`
5. Each assistant response → `sendViaWebhook(channelId, text)`

## Support

For issues:
1. Check logs
2. Review health endpoints
3. Contact: sasha@awkward-media.com
