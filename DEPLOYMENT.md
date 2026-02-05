# AI Agent Deployment Guide

## Prerequisites

Before deploying the AI Agent Service, ensure you have:

1. ✅ Anthropic API key (Claude)
2. ✅ Zoho Cliq bot configured
3. ✅ Jira API credentials
4. ✅ GitHub Personal Access Token (PAT)
5. ✅ Server access (SSH credentials)
6. ✅ Docker installed on server

## GitHub Secrets Configuration

Add these secrets to your GitHub repository:

### Repository Settings → Secrets and Variables → Actions

```bash
# Server Access (same as main app)
HOST=your_server_ip
USERNAME=your_ssh_username
PASSWORD=your_ssh_password
PORT=22

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Supabase (same as main app)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Cliq Integration
CLIQ_WEBHOOK_SECRET=your_webhook_secret_generate_random
CLIQ_API_TOKEN=your_cliq_bot_token
CLIQ_BOT_NAME=AI Support Agent

# Jira Integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=PROJ

# GitHub (for code access)
GH_PAT=ghp_...  # GitHub Personal Access Token with repo read access
```

## Step-by-Step Setup

### 1. Get Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create account or sign in
3. Navigate to API Keys
4. Create new key → Copy it
5. Add to GitHub Secrets as `ANTHROPIC_API_KEY`

**Cost:** ~$0.05-$0.15 per bug analysis

### 2. Configure Zoho Cliq Bot

#### Create Bot:
1. Open Zoho Cliq → Bots & Tools → Bots
2. Click "Create Bot"
3. Name: "AI Support Agent"
4. Description: "Analyzes bug reports and creates Jira tickets"
5. Save → Copy Bot Token

#### Configure Webhook:
1. Bot Settings → Incoming Webhook
2. Webhook URL: `https://your-domain.com/webhook/cliq`
3. Generate Secret: `openssl rand -hex 32`
4. Select Events: "Message created"
5. Save configuration

#### Add Bot to Channel:
1. Go to your support/bug channel
2. Click channel settings → Add Bot
3. Select "AI Support Agent"
4. Grant permissions

#### Add to GitHub Secrets:
```bash
CLIQ_API_TOKEN=your_bot_token_here
CLIQ_WEBHOOK_SECRET=generated_secret_here
```

### 3. Setup Jira Integration

#### Get Jira API Token:
1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Label: "AI Agent"
4. Copy token

#### Find Project Key:
1. Open your Jira project
2. Look at URL: `https://your-domain.atlassian.net/browse/PROJ-123`
3. Project key is `PROJ`

#### Add to GitHub Secrets:
```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-jira-email@example.com
JIRA_API_TOKEN=your_api_token_here
JIRA_PROJECT_KEY=PROJ
```

#### Verify Permissions:
Ensure Jira user can:
- Create issues in target project
- Add labels
- Set priority

### 4. GitHub Personal Access Token

#### Create PAT:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Name: "AI Agent Code Access"
4. Scopes:
   - ✅ `repo` (full repository access)
5. Generate → Copy token

#### Add to GitHub Secrets:
```bash
GH_PAT=ghp_your_token_here
```

**Note:** This is different from `GITHUB_TOKEN` (which is auto-generated per workflow).

### 5. Supabase Configuration

Use the same Supabase credentials as main app:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### Apply Database Migration:

1. Open Supabase Dashboard → SQL Editor
2. Run migration `migrations/015_ai_agent_conversations.sql`
3. Verify table created: `ai_agent_conversations`

### 6. Server Preparation

SSH into your server:

```bash
ssh username@your-server-ip
```

#### Install Required Tools:

```bash
# Install ripgrep (for code search)
sudo apt-get update
sudo apt-get install -y ripgrep

# Verify Docker is installed
docker --version

# If not installed:
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

#### Create Repository Clone Directory:

```bash
sudo mkdir -p /opt/awkward-crm-repo
sudo chown -R $USER:$USER /opt/awkward-crm-repo
```

**Note:** GitHub Actions will clone the repo automatically during deployment.

### 7. Deploy

#### Option A: Automatic (via GitHub Actions)

1. Push changes to `main` branch:
   ```bash
   git add ai_agent/
   git commit -m "feat: Add AI Agent Service"
   git push origin main
   ```

2. Workflow will automatically:
   - Build Docker image
   - Push to GitHub Container Registry
   - Deploy to server
   - Clone/update repository for code analysis

3. Monitor deployment:
   - Go to GitHub → Actions tab
   - Watch "Deploy AI Agent Service" workflow

#### Option B: Manual Deployment

```bash
# SSH into server
ssh username@your-server-ip

# Clone repository (if not exists)
cd /opt
git clone https://github.com/your-org/your-repo.git awkward-crm-repo

# Build and run
cd /path/to/repo
docker build -t ai-agent:latest ./ai_agent

docker run -d \
  --name awkward-crm-ai-agent \
  --restart unless-stopped \
  -p 3002:3002 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/awkward-crm-repo:/opt/repo:ro \
  -e PORT=3002 \
  -e NODE_ENV=production \
  -e ANTHROPIC_API_KEY="your_key" \
  -e SUPABASE_URL="your_url" \
  -e SUPABASE_SERVICE_ROLE_KEY="your_key" \
  -e CLIQ_WEBHOOK_SECRET="your_secret" \
  -e CLIQ_API_TOKEN="your_token" \
  -e CLIQ_BOT_NAME="AI Support Agent" \
  -e JIRA_BASE_URL="your_jira_url" \
  -e JIRA_EMAIL="your_email" \
  -e JIRA_API_TOKEN="your_jira_token" \
  -e JIRA_PROJECT_KEY="PROJ" \
  -e GITHUB_TOKEN="your_gh_pat" \
  -e REPO_CLONE_PATH=/opt/repo \
  -e MAIN_APP_CONTAINER_NAME=awkward-crm-app \
  -e SEO_ENGINE_CONTAINER_NAME=awkward-crm-seo-engine \
  -e MAX_CONVERSATION_TURNS=10 \
  ai-agent:latest
```

### 8. Verify Deployment

#### Check Service Health:

```bash
# On server
curl http://localhost:3002/health

# Expected response:
{
  "status": "healthy",
  "service": "AI Agent",
  "features": {
    "claudeAPI": "enabled",
    "cliqIntegration": "enabled",
    "jiraIntegration": "enabled",
    "githubAccess": "enabled",
    "dockerLogs": "enabled"
  }
}
```

#### Check Detailed Health:

```bash
curl http://localhost:3002/health/detailed
```

#### View Logs:

```bash
docker logs awkward-crm-ai-agent

# Follow logs
docker logs -f awkward-crm-ai-agent
```

#### Test Cliq Integration:

1. Post message in configured Cliq channel
2. Bot should react with 👀 (processing)
3. Wait for analysis response
4. Bot should react with ✅ (complete)

### 9. Configure Firewall (Optional)

If using external webhook URL:

```bash
# Allow port 3002 (if exposing directly)
sudo ufw allow 3002/tcp

# Or use reverse proxy (recommended)
# Example with Caddy:
your-domain.com {
    reverse_proxy /webhook/cliq localhost:3002
}
```

## Troubleshooting

### Deployment Failed

**Check GitHub Actions logs:**
1. GitHub → Actions → Failed workflow
2. Expand failed step
3. Check error message

**Common issues:**
- Missing secrets → Add all required secrets
- SSH access denied → Verify HOST, USERNAME, PASSWORD
- Docker build failed → Check Dockerfile syntax

### Bot Not Responding

1. **Check service is running:**
   ```bash
   docker ps | grep ai-agent
   ```

2. **Check health:**
   ```bash
   curl http://localhost:3002/health
   ```

3. **Check logs:**
   ```bash
   docker logs awkward-crm-ai-agent
   ```

4. **Verify Cliq webhook:**
   - Webhook URL is correct
   - Webhook secret matches
   - Bot is added to channel

### Jira Tickets Not Created

1. **Test Jira credentials:**
   ```bash
   curl -u email:api_token \
     https://your-domain.atlassian.net/rest/api/3/project/PROJ
   ```

2. **Check permissions:**
   - User can create issues
   - Project key is correct

3. **Check logs for Jira errors:**
   ```bash
   docker logs awkward-crm-ai-agent | grep -i jira
   ```

### Code Analysis Not Working

1. **Check repository clone:**
   ```bash
   ls -la /opt/awkward-crm-repo
   ```

2. **Verify mount:**
   ```bash
   docker exec awkward-crm-ai-agent ls -la /opt/repo
   ```

3. **Test ripgrep:**
   ```bash
   docker exec awkward-crm-ai-agent rg --version
   ```

4. **Test git:**
   ```bash
   docker exec awkward-crm-ai-agent git --version
   ```

## Maintenance

### Update Repository Clone

Bot will auto-update on deployment, but you can manually update:

```bash
cd /opt/awkward-crm-repo
git pull origin main
```

### View Conversations

Query Supabase:

```sql
SELECT
  conversation_id,
  status,
  created_at,
  updated_at,
  jsonb_array_length(messages) as message_count
FROM ai_agent_conversations
ORDER BY updated_at DESC
LIMIT 10;
```

### Clean Up Old Conversations

Automatic cleanup runs every hour. Manual cleanup:

```sql
DELETE FROM ai_agent_conversations
WHERE status = 'closed'
  AND updated_at < NOW() - INTERVAL '7 days';
```

### Restart Service

```bash
docker restart awkward-crm-ai-agent
```

### Update Service

Push changes to `main` branch → GitHub Actions will auto-deploy.

Or manually:

```bash
docker pull ghcr.io/your-org/your-repo/ai-agent:latest
docker stop awkward-crm-ai-agent
docker rm awkward-crm-ai-agent
# Run docker run command again (see step 7)
```

## Monitoring

### Health Checks

Set up monitoring service (e.g., UptimeRobot, Pingdom):

- URL: `https://your-domain.com/webhook/cliq/../health`
- Interval: 5 minutes
- Alert on: Status != 200

### Log Aggregation

Consider setting up log aggregation:
- Docker logs → Syslog → Log service
- Or use Docker logging driver

### Metrics

Track in Supabase or external service:
- Conversations per day
- Tools used frequency
- Jira tickets created
- Average response time
- Error rate

## Security Notes

- ✅ Webhook signature verification (HMAC-SHA256)
- ✅ Repository mounted as read-only
- ✅ Docker socket access limited
- ✅ Secrets stored in environment variables
- ✅ RLS enabled on conversations table
- ✅ Path traversal prevention in file reads

**Best Practices:**
- Rotate API tokens regularly
- Monitor for suspicious activity
- Keep dependencies updated
- Review Jira tickets created by bot

## Cost Estimation

**Per Bug Report:**
- Claude API: $0.05 - $0.15
- Tool executions: Free (local)
- Storage: Minimal

**Monthly (100 reports):**
- Total: ~$5 - $15

**Tips to Reduce Costs:**
- Use GPT-5-mini instead of Claude (cheaper, but lower quality)
- Limit MAX_CONVERSATION_TURNS (reduce API calls)
- Cache common queries

## Support

Need help? Check:
1. [README.md](./README.md) - Full documentation
2. GitHub Issues
3. Logs: `docker logs awkward-crm-ai-agent`
4. Health: `http://localhost:3002/health/detailed`

Contact: sasha@awkward-media.com
