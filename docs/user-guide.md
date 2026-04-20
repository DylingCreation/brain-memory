# User Guide

This guide explains how to use brain-memory effectively in your applications.

## Getting Started

### Installation
```bash
npm install brain-memory
```

### Basic Setup
```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'brain-memory';

// Create a configuration
const config = {
  ...DEFAULT_CONFIG,
  dbPath: './my-brain-memory.db',
  llm: {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  embedding: {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small'
  }
};

// Initialize the engine
const engine = new ContextEngine(config);
```

## Core Concepts

### Memory Categories
brain-memory organizes knowledge into 8 categories:

1. **Profile**: User characteristics and preferences
2. **Preferences**: User preferences and settings
3. **Entities**: People, places, organizations
4. **Events**: Temporal occurrences and activities
5. **Tasks**: Goals and work items
6. **Skills**: Capabilities and competencies
7. **Cases**: Specific examples and precedents
8. **Patterns**: Reusable templates and strategies

### Dual-Path Recall
The system uses two complementary approaches to retrieve information:

- **Graph Path**: Uses semantic relationships and community structures
- **Vector Path**: Uses semantic similarity and content matching

## Key Features

### Knowledge Extraction
Automatically extract knowledge from conversations:

```typescript
const result = await engine.processTurn({
  sessionId: 'user-session-123',
  agentId: 'my-agent',
  workspaceId: 'my-workspace',
  messages: [{
    role: 'user',
    content: 'I prefer using TypeScript for backend development because of its type safety'
  }, {
    role: 'assistant', 
    content: 'That makes sense. TypeScript does provide excellent type safety for backend development.'
  }]
});

console.log(`Extracted ${result.extractedNodes.length} nodes and ${result.extractedEdges.length} edges`);
```

### Knowledge Recall
Retrieve relevant knowledge for a query:

```typescript
const recallResult = await engine.recall(
  'TypeScript backend development best practices',
  'user-session-123',  // Optional session ID for scope
  'my-agent',          // Optional agent ID for scope  
  'my-workspace'       // Optional workspace ID for scope
);

console.log(`Found ${recallResult.nodes.length} relevant memories`);
```

### Working Memory Management
The system maintains context across conversations:

```typescript
// Get current working memory context
const context = engine.getWorkingMemoryContext();

// Use context in your application
const enhancedPrompt = `
Context: ${context || 'No prior context'}

User Query: ${userQuery}

Please respond considering the above context.
`;
```

## Configuration Options

### Basic Configuration
```typescript
const config = {
  dbPath: './brain-memory.db',  // Database file path
  recallMaxNodes: 10,           // Max nodes to recall
  fusion: {
    enabled: true,              // Enable knowledge fusion
    similarityThreshold: 0.85,  // Threshold for duplicate detection
    minNodes: 50,               // Min nodes for fusion
    minCommunities: 5           // Min communities for fusion
  },
  decay: {
    enabled: true,              // Enable memory decay
    timeDecayHalfLifeDays: 30,  // How quickly memories fade
    recencyHalfLifeDays: 7      // How recency affects importance
  },
  reflection: {
    enabled: true,              // Enable reflection
    turnReflection: true,       // Reflect on each turn
    sessionReflection: true     // Reflect on session end
  }
};
```

### Advanced Configuration
```typescript
const advancedConfig = {
  ...config,
  noise: {
    enabled: true,              // Filter out noise
    minContentLength: 10,       // Minimum content length to process
    patterns: ['^hi$', '^ok$', '^thanks?$'] // Patterns to filter
  },
  admission: {
    enabled: true,              // Control what gets stored
    minContentLength: 20,       // Minimum length to admit
    duplicateThreshold: 0.9     // Threshold for duplicate rejection
  },
  recall: {
    strategy: 'hybrid',         // 'vector', 'graph', or 'hybrid'
    maxDepth: 3,                // Max graph traversal depth
    topK: 20                    // Top K results to consider
  }
};
```

## Practical Examples

### Building a Chat Assistant
```typescript
class ChatAssistant {
  private memory: ContextEngine;
  
  constructor(memory: ContextEngine) {
    this.memory = memory;
  }
  
  async respond(userInput: string, sessionId: string) {
    try {
      // Retrieve relevant memories
      const recallResult = await this.memory.recall(userInput, sessionId);
      
      // Build enhanced context
      const memoryContext = this.buildMemoryContext(recallResult);
      
      // Create enriched prompt
      const enhancedPrompt = `
      Previous conversation context:
      ${memoryContext || 'No previous context'}
      
      User: ${userInput}
      
      Assistant:`;
      
      // Generate response using your preferred LLM
      const response = await this.generateResponse(enhancedPrompt);
      
      // Process the turn to extract new knowledge
      await this.memory.processTurn({
        sessionId,
        agentId: 'chat-assistant',
        workspaceId: 'default',
        messages: [
          { role: 'user', content: userInput },
          { role: 'assistant', content: response }
        ]
      });
      
      return response;
    } catch (error) {
      console.error('Chat assistant error:', error);
      return "I encountered an error processing your request.";
    }
  }
  
  private buildMemoryContext(recallResult: RecallResult): string | null {
    if (recallResult.nodes.length === 0) return null;
    
    return recallResult.nodes
      .slice(0, 5) // Take top 5 most relevant
      .map(node => `- ${node.name}: ${node.content.substring(0, 200)}...`)
      .join('\n');
  }
  
  private async generateResponse(prompt: string): Promise<string> {
    // Your LLM integration here
    // This is just a placeholder
    return "This is a placeholder response.";
  }
}
```

### Task Management Enhancement
```typescript
class TaskManager {
  private memory: ContextEngine;
  
  constructor(memory: ContextEngine) {
    this.memory = memory;
  }
  
  async createTask(taskDescription: string, sessionId: string) {
    // Process the task description to extract knowledge
    const result = await this.memory.processTurn({
      sessionId,
      agentId: 'task-manager',
      workspaceId: 'tasks',
      messages: [{
        role: 'user',
        content: `Create a task: ${taskDescription}`
      }]
    });
    
    // Return task with associated knowledge
    return {
      id: result.extractedNodes[0]?.id || null,
      description: taskDescription,
      relatedKnowledge: result.extractedNodes
        .filter(n => n.category !== 'tasks') // Exclude the task itself
        .map(n => ({ name: n.name, category: n.category }))
    };
  }
  
  async suggestRelatedTasks(userInput: string, sessionId: string) {
    // Recall relevant tasks and related knowledge
    const result = await this.memory.recall(userInput, sessionId);
    
    // Extract task-related nodes
    const relatedTasks = result.nodes.filter(node => 
      node.category === 'tasks' || node.type === 'TASK'
    );
    
    return relatedTasks.map(task => ({
      name: task.name,
      description: task.content,
      relevance: result.nodes.find(n => n.id === task.id)?.relevance || 0
    }));
  }
}
```

## Performance Tips

### Optimizing Recall Speed
1. **Use Scope Filtering**: Limit searches to relevant sessions/agents/workspaces
2. **Adjust Top-K Values**: Balance between accuracy and speed
3. **Implement Caching**: Cache frequent queries when appropriate

### Memory Management
1. **Configure Decay Properly**: Tune half-life values for your use case
2. **Monitor Database Size**: Regular maintenance prevents bloat
3. **Use Appropriate Data Categories**: Proper categorization improves retrieval

### LLM Cost Optimization
1. **Batch Operations**: Process multiple messages together when possible
2. **Filter Noise Early**: Prevent unnecessary LLM calls
3. **Adjust Frequency**: Control how often reflection and reasoning occur

## Troubleshooting

### Common Issues

#### Slow Performance
- Check database size and run maintenance
- Verify scope filters are properly configured
- Consider adjusting recall parameters

#### Poor Recall Quality
- Review the quality of extracted knowledge
- Adjust similarity thresholds
- Verify embedding model quality

#### High LLM Costs
- Enable noise filtering to reduce unnecessary calls
- Adjust reflection and reasoning frequencies
- Consider using cheaper models for some operations

### Debugging
Enable debug mode to get detailed logs:
```bash
BM_DEBUG=true node your-app.js
```

### Error Handling
```typescript
try {
  const result = await engine.processTurn({
    // ... turn parameters
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Invalid input:', error.message);
  } else if (error instanceof DatabaseError) {
    console.log('Database error, retrying...');
    // Implement retry logic
  } else {
    console.log('Unexpected error:', error);
    // Handle gracefully
  }
}
```

## Best Practices

### Data Quality
- Ensure high-quality inputs for better extractions
- Regularly review and clean extracted knowledge
- Use consistent naming conventions

### Scalability
- Implement proper scope management for multi-user scenarios
- Monitor and tune performance parameters
- Plan for database growth and maintenance

### Security
- Store API keys securely using environment variables
- Implement proper access controls
- Regularly update dependencies

## Integration Patterns

### Event-Driven Architecture
```typescript
// Listen for memory events
engine.on('knowledge-extracted', (data) => {
  console.log(`Extracted ${data.nodes.length} nodes in session ${data.sessionId}`);
});

engine.on('memory-recalled', (data) => {
  console.log(`Recalled ${data.count} memories for query: ${data.query.substring(0, 50)}...`);
});
```

### Middleware Pattern
```typescript
// Create middleware for memory enhancement
function withMemoryEnhancement(engine: ContextEngine) {
  return async (handler: (req: any, ctx: any) => Promise<any>) => {
    return async (req: any) => {
      // Enhance request with relevant memories
      const context = await engine.recall(req.input, req.sessionId);
      const enhancedReq = { ...req, memoryContext: context };
      
      // Process request
      const result = await handler(enhancedReq, {
        memory: engine
      });
      
      // Store new knowledge from response
      if (result.response) {
        await engine.processTurn({
          sessionId: req.sessionId,
          agentId: req.agentId,
          workspaceId: req.workspaceId,
          messages: [
            { role: 'user', content: req.input },
            { role: 'assistant', content: result.response }
          ]
        });
      }
      
      return result;
    };
  };
}
```

This guide covers the essential aspects of using brain-memory effectively. For more detailed information about specific features, refer to the API documentation and examples.