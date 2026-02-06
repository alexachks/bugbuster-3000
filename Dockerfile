# AI Agent Service Dockerfile
FROM node:20-alpine

# Install git and ripgrep for code analysis
RUN apk add --no-cache git ripgrep docker-cli

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Copy system prompt (will be overridden by volume mount in production)
COPY .claude/ ./.claude/

# Create directory for repository clones
RUN mkdir -p /tmp/repo-clone

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start service
CMD ["node", "src/server.js"]
