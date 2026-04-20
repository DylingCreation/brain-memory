/**
 * Simple test to verify ContextEngine functionality
 */

import { ContextEngine } from './src/engine/context.ts';
import { DEFAULT_CONFIG } from './src/types.ts';

async function testEngine() {
  console.log('Initializing ContextEngine...');
  
  // Use a temporary database path for testing
  const config = {
    ...DEFAULT_CONFIG,
    dbPath: './test-brain-memory.db',
    llm: {
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-test',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo'
    },
    embedding: {
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-test',
      baseURL: 'https://api.openai.com/v1',
      model: 'text-embedding-ada-002'
    }
  };

  try {
    const engine = new ContextEngine(config);
    console.log('✓ ContextEngine initialized successfully');
    
    // Test basic functionality
    const stats = engine.getStats();
    console.log('✓ Stats retrieval works:', stats);
    
    // Test memory context
    const context = engine.getWorkingMemoryContext();
    console.log('✓ Working memory context retrieval works');
    
    // Close the engine
    engine.close();
    console.log('✓ Engine closed successfully');
    
    console.log('\nContextEngine is working correctly!');
    return true;
  } catch (error) {
    console.error('✗ Error initializing ContextEngine:', error);
    return false;
  }
}

// Run the test
testEngine().then(success => {
  if (success) {
    console.log('\n🎉 All tests passed! The brain-memory engine is ready.');
  } else {
    console.log('\n❌ Tests failed. Please check the implementation.');
  }
});