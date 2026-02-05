import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Import routes
import cliqRoutes from './routes/cliq.js';
import healthRoutes from './routes/health.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
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

// Routes
app.use('/health', healthRoutes);
app.use('/webhook/cliq', cliqRoutes);

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

// Start server
app.listen(PORT, () => {
  console.log(`🤖 AI Agent running on port ${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Claude API: ${process.env.ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🔧 Cliq: ${process.env.CLIQ_API_TOKEN ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🔧 Jira: ${process.env.JIRA_API_TOKEN ? '✓ Configured' : '✗ Missing'}`);
  console.log(`🔧 GitHub: ${process.env.GITHUB_TOKEN ? '✓ Configured' : '✗ Missing'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 AI Agent shutting down gracefully...');
  process.exit(0);
});

export default app;
