# Deployment Guide

This document provides instructions for deploying brain-memory in various environments.

## Prerequisites

- Node.js 18 or higher
- npm or yarn package manager
- SQLite3 (usually bundled with Node.js)

## Installation

### From NPM
```bash
npm install brain-memory
```

### From Source
```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
npm run build
```

## Configuration

### Environment Variables
```bash
# Required
BM_DB_PATH=./brain-memory.db
OPENAI_API_KEY=your_openai_api_key

# Optional
BM_LLM_BASE_URL=https://api.openai.com/v1
BM_LLM_MODEL=gpt-4o-mini
BM_EMBEDDING_MODEL=text-embedding-3-small
BM_RECALL_MAX_NODES=10
BM_DECAY_ENABLED=true
```

### Programmatic Configuration
```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'brain-memory';

const config = {
  ...DEFAULT_CONFIG,
  dbPath: process.env.BM_DB_PATH || './brain-memory.db',
  llm: {
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.BM_LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.BM_LLM_MODEL || 'gpt-4o-mini'
  },
  embedding: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.BM_EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.BM_EMBEDDING_MODEL || 'text-embedding-3-small'
  },
  recallMaxNodes: parseInt(process.env.BM_RECALL_MAX_NODES || '10'),
  decay: {
    ...DEFAULT_CONFIG.decay,
    enabled: process.env.BM_DECAY_ENABLED === 'true'
  }
};

const engine = new ContextEngine(config);
```

## Deployment Scenarios

### Standalone Application
Deploy as a library within your application:

```typescript
import { ContextEngine } from 'brain-memory';

class MyApplication {
  private memory: ContextEngine;
  
  constructor() {
    this.memory = new ContextEngine({
      dbPath: './app-memory.db',
      llm: {
        apiKey: process.env.LLM_API_KEY!,
        baseURL: process.env.LLM_BASE_URL!,
        model: 'gpt-4o-mini'
      }
    });
  }
  
  async processUserInput(input: string) {
    // Use memory for context enhancement
    const context = await this.memory.recall(input);
    // Process with enhanced context
    return await this.processWithMemory(input, context);
  }
}
```

### Microservice
Deploy as a dedicated microservice:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Containerized Deployment
Create a Docker container:

```dockerfile
FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache sqlite

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directory for database
RUN mkdir -p /data

# Set environment variables
ENV BM_DB_PATH=/data/memory.db

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

CMD ["npm", "start"]
```

## Production Considerations

### Database Management
- Regular backups of the SQLite database file
- Monitor disk space usage
- Consider WAL mode for concurrent access
- Implement connection pooling for high-load scenarios

### Performance Tuning
```typescript
const productionConfig = {
  ...DEFAULT_CONFIG,
  dbPath: '/persistent-storage/brain-memory.db',
  recallMaxNodes: 20,           // Increase for richer context
  fusion: {
    ...DEFAULT_CONFIG.fusion,
    similarityThreshold: 0.85,  // Adjust based on precision needs
    minNodes: 50,               // Lower threshold for smaller graphs
    minCommunities: 5           // Lower threshold for smaller graphs
  },
  decay: {
    ...DEFAULT_CONFIG.decay,
    enabled: true,
    timeDecayHalfLifeDays: 30,   // Adjust based on domain
    recencyHalfLifeDays: 7      // Adjust based on activity patterns
  }
};
```

### Monitoring and Logging
Enable detailed logging in production:

```typescript
// Enable debug logging
process.env.BM_DEBUG = 'true';

// Log key events
engine.on('memory-extracted', (data) => {
  console.log(`Extracted ${data.count} memories for session ${data.sessionId}`);
});

engine.on('recall-executed', (data) => {
  console.log(`Recall took ${data.durationMs}ms, returned ${data.count} results`);
});
```

### Security Best Practices
- Store API keys securely using environment variables or secret managers
- Implement proper access controls for the database file
- Validate all inputs before processing
- Use HTTPS for API communications
- Implement rate limiting for API calls

## Scaling Strategies

### Horizontal Scaling
- Use separate databases per tenant with scope isolation
- Implement load balancing across multiple instances
- Use CDN for cached responses

### Vertical Scaling
- Optimize database queries and indexes
- Increase memory allocation for vector operations
- Use faster storage (SSD) for database files

## Troubleshooting

### Common Issues
1. **Database Locked Errors**: Usually caused by concurrent access; ensure proper connection handling
2. **High Memory Usage**: Large vector operations; consider batching or increasing heap size
3. **Slow Queries**: Missing indexes; verify database schema

### Debugging
Enable debug mode:
```bash
BM_DEBUG=true npm start
```

Monitor database performance:
```sql
-- Check for slow queries
SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index';

-- Analyze database
ANALYZE;
```

## Maintenance

### Backup Strategy
Regularly backup the database file:
```bash
# Daily backup
cp /data/brain-memory.db /backup/brain-memory-$(date +%Y%m%d).db

# Compressed backup
gzip /backup/brain-memory-$(date +%Y%m%d).db
```

### Cleanup Procedures
```typescript
// Run maintenance regularly
setInterval(async () => {
  await engine.runMaintenance();
}, 24 * 60 * 60 * 1000); // Once per day
```

### Upgrade Process
1. Stop the application
2. Backup the database
3. Update the package
4. Run any required migration scripts
5. Restart the application