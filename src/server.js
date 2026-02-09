// Load environment variables FIRST (before any other imports that use env vars)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';

// Import routes
import cliqRoutes from './routes/cliq.js';
import healthRoutes from './routes/health.js';
import meetRoutes from './routes/meet.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for bot UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:"] // Allow WebSocket connections
    }
  }
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? true // Allow all origins in production for webhooks
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`🤖 ${req.method} ${req.url} - Origin: ${req.get('Origin')}`);
  next();
});

// Static files for bot UI
app.use('/bot-ui', express.static('public'));

// Routes
app.use('/health', healthRoutes);
app.use('/webhook/cliq', cliqRoutes);
app.use('/meet', meetRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    service: 'AI Agent'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    service: 'AI Agent'
  });
});

// Create HTTP server
const server = http.createServer(app);

// Start server
server.listen(PORT, () => {
  console.log(`🤖 BugBuster 3000 AI Agent running on port ${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n🔧 Configuration:`);
  console.log(`   - Claude SDK: ${process.env.ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`   - Cliq Webhook: ${process.env.CLIQ_BOT_WEBHOOK_URL ? '✓ Configured' : '✗ Missing'}`);
  console.log(`   - Jira: ${process.env.JIRA_API_TOKEN ? '✓ Configured' : '✗ Missing'}`);
  console.log(`   - Recall.ai: ${process.env.RECALL_AI_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`\n📍 Endpoints:`);
  console.log(`   - POST /webhook/cliq/participate - Cliq participation handler`);
  console.log(`   - GET  /webhook/cliq/health - Cliq integration health`);
  console.log(`   - POST /meet/webhook - Recall.ai webhook handler`);
  console.log(`   - GET  /meet/health - Meet integration health`);
  console.log(`   - GET  /health - Service health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 AI Agent shutting down gracefully...');
  process.exit(0);
});

export default app;
