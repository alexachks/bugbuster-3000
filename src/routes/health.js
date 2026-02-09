import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AI Agent',
    version: '1.0.0',
    features: {
      claudeAPI: process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled',
      cliqWebhook: process.env.CLIQ_BOT_WEBHOOK_URL ? 'enabled' : 'disabled',
      jiraIntegration: process.env.JIRA_API_TOKEN ? 'enabled' : 'disabled'
    }
  };

  res.json(status);
});

router.get('/detailed', async (req, res) => {
  const checks = {
    timestamp: new Date().toISOString(),
    service: 'AI Agent',
    checks: {}
  };

  // Check Claude API
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      checks.checks.claudeAPI = { status: 'configured', message: 'API key present' };
    } else {
      checks.checks.claudeAPI = { status: 'missing', message: 'API key not configured' };
    }
  } catch (error) {
    checks.checks.claudeAPI = { status: 'error', message: error.message };
  }

  // Check Cliq webhook
  checks.checks.cliqWebhook = process.env.CLIQ_BOT_WEBHOOK_URL
    ? { status: 'configured', message: 'Webhook URL present' }
    : { status: 'missing', message: 'Webhook URL not configured' };

  // Check Jira configuration
  checks.checks.jira = process.env.JIRA_API_TOKEN
    ? { status: 'configured', message: 'API token present' }
    : { status: 'missing', message: 'API token not configured' };

  // Overall health
  const allConfigured = Object.values(checks.checks).every(
    check => check.status === 'configured'
  );
  checks.overall = allConfigured ? 'healthy' : 'degraded';

  res.json(checks);
});

export default router;
