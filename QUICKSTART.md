# AI Agent Quick Start Guide

Get your AI Support Agent running in 15 minutes.

## Step 1: Install Dependencies (2 min)

```bash
cd ai_agent
npm install
```

## Step 2: Setup Environment (5 min)

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add **minimum required** variables:

```bash
# Required for basic functionality
ANTHROPIC_API_KEY=sk-ant-xxx        # Get from console.anthropic.com
REPO_CLONE_PATH=/tmp/repo-clone      # Path to cloned repository

# Optional (but needed for full functionality)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
CLIQ_API_TOKEN=xxx
JIRA_API_TOKEN=xxx
```

## Step 3: Clone Repository for Analysis (2 min)

```bash
# Clone your repository (the one agent will analyze)
git clone https://github.com/your-org/your-repo.git /tmp/repo-clone
```

**Important:** This must match `REPO_CLONE_PATH` in `.env`

## Step 4: Setup Database (3 min)

**Option A: Supabase (Recommended)**

1. Open Supabase Dashboard → SQL Editor
2. Run migration: `../migrations/015_ai_agent_conversations.sql`
3. Verify table created: `ai_agent_conversations`

**Option B: Skip (Testing Only)**

Agent will work without database, but won't persist conversations.

## Step 5: Start Service (1 min)

```bash
npm run dev
```

You should see:

```
🤖 AI Agent running on port 3002
🩺 Health check: http://localhost:3002/health
🔧 Claude API: ✓ Configured
```

## Step 6: Test Locally (2 min)

**Test without Cliq:**

```bash
npm run test:local "Search for authentication code"
```

Expected output:
```
🤖 AI Agent Local Test
📨 User Message: "Search for authentication code"
🔄 Processing...

✅ Agent Response:

I've searched the codebase for authentication code. Here's what I found:
[... detailed analysis ...]

🔧 Tools Used:
  • search_code ✓
  • read_file ✓
  • git_log ✓

✅ Test complete!
```

## Step 7: Test with Cliq (Optional)

If you have Cliq configured:

1. Post message in configured channel
2. Bot should react with 👀
3. Wait for response
4. Bot should react with ✅

## Common Issues

### "Repository path not configured"

**Fix:** Set `REPO_CLONE_PATH` in `.env` and clone repository:

```bash
git clone <your-repo-url> /tmp/repo-clone
```

### "Claude API key missing"

**Fix:** Get API key from [console.anthropic.com](https://console.anthropic.com) and add to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx
```

### "Tool execution failed"

**Fix:** Install missing tools:

```bash
# macOS
brew install ripgrep git

# Ubuntu/Debian
sudo apt-get install ripgrep git

# Check installations
rg --version
git --version
```

### Port 3002 already in use

**Fix:** Change port in `.env`:

```bash
PORT=3003
```

## Next Steps

1. **Configure Cliq Integration** → See [DEPLOYMENT.md](./DEPLOYMENT.md#2-configure-zoho-cliq-bot)
2. **Configure Jira Integration** → See [DEPLOYMENT.md](./DEPLOYMENT.md#3-setup-jira-integration)
3. **Deploy to Server** → See [DEPLOYMENT.md](./DEPLOYMENT.md#7-deploy)
4. **Read Full Documentation** → See [README.md](./README.md)

## Quick Reference

```bash
# Start development server
npm run dev

# Start production server
npm start

# Test locally without Cliq
npm run test:local "your message here"

# Check health
curl http://localhost:3002/health

# View logs (if using Docker)
docker logs awkward-crm-ai-agent

# Stop service
docker stop awkward-crm-ai-agent
```

## Minimal Working Configuration

**For testing without external services:**

```bash
# .env (minimum)
ANTHROPIC_API_KEY=sk-ant-xxx
REPO_CLONE_PATH=/tmp/repo-clone
PORT=3002
```

This will enable:
- ✅ Code search and analysis
- ✅ Git history inspection
- ✅ File reading
- ❌ Cliq integration (needs CLIQ_API_TOKEN)
- ❌ Jira tickets (needs JIRA_API_TOKEN)
- ❌ Docker logs (needs Docker access)
- ❌ Conversation persistence (needs Supabase)

## Support

- 📖 [README.md](./README.md) - Full documentation
- 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) - Production setup
- 💬 Contact: sasha@awkward-media.com
