/**
 * brain-memory — ContextEngine integration tests
 * 
 * Tests for the main ContextEngine class integration with other components
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { ContextEngine } from '../../src/engine/context.ts';
import { DEFAULT_CONFIG } from '../../src/types.ts';
import fs from 'fs';

describe('ContextEngine Integration', () => {
  let engine: ContextEngine;
  const testDbPath = './test-brain-memory-integration.db';

  beforeEach(() => {
    // Create a temporary database for testing
    const config = {
      ...DEFAULT_CONFIG,
      dbPath: testDbPath,
      llm: {
        apiKey: 'test-key', // This will use mock LLM
        baseURL: 'https://api.example.com',
        model: 'gpt-4o-mini'
      },
      embedding: {
        apiKey: 'test-key',
        baseURL: 'https://api.example.com',
        model: 'text-embedding-3-small'
      }
    };
    
    engine = new ContextEngine(config);
  });

  afterEach(() => {
    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  it('should integrate all major components', async () => {
    // Verify all major methods exist and are callable
    expect(engine.processTurn).toBeDefined();
    expect(engine.recall).toBeDefined();
    expect(engine.performFusion).toBeDefined();
    expect(engine.reflectOnSession).toBeDefined();
    expect(engine.performReasoning).toBeDefined();
    expect(engine.runMaintenance).toBeDefined();
    expect(engine.searchNodes).toBeDefined();
    expect(engine.getAllActiveNodes).toBeDefined();
  });

  it('should maintain working memory context', async () => {
    const initialContext = engine.getWorkingMemoryContext();
    expect(initialContext).toBeDefined();
  });
});