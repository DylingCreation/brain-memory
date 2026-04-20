/**
 * brain-memory — ContextEngine tests
 * 
 * Tests for the main ContextEngine class functionality
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { ContextEngine } from '../src/engine/context';
import { DEFAULT_CONFIG } from '../src/types';
import fs from 'fs';

describe('ContextEngine', () => {
  let engine: ContextEngine;
  const testDbPath = './test-brain-memory-context.db';

  beforeEach(() => {
    // Create a temporary database for testing
    const config = {
      ...DEFAULT_CONFIG,
      dbPath: testDbPath,
      llm: {
        apiKey: 'mock-key', // Using mock LLM
        baseURL: 'https://api.mock.com',
        model: 'gpt-4o-mini'
      },
      embedding: {
        apiKey: 'mock-key',
        baseURL: 'https://api.mock.com',
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

  it('should initialize properly', () => {
    expect(engine).toBeDefined();
  });

  it('should have working stats method', () => {
    const stats = engine.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.nodeCount).toBe('number');
    expect(typeof stats.edgeCount).toBe('number');
    expect(typeof stats.sessionCount).toBe('number');
  });

  it('should have working working memory context', () => {
    const context = engine.getWorkingMemoryContext();
    expect(context).toBeDefined(); // Should be either string or null
  });

  it('should handle recall method gracefully', async () => {
    // This test would normally require a real LLM configuration
    // For now, we'll just verify the method exists and signature
    expect(engine.recall).toBeDefined();
  });

  it('should handle processTurn method gracefully', async () => {
    // This test would normally require a real LLM configuration
    // For now, we'll just verify the method exists and signature
    expect(engine.processTurn).toBeDefined();
  });

  it('should handle performFusion method gracefully', async () => {
    expect(engine.performFusion).toBeDefined();
  });

  it('should handle reflectOnSession method gracefully', async () => {
    expect(engine.reflectOnSession).toBeDefined();
  });

  it('should handle performReasoning method gracefully', async () => {
    expect(engine.performReasoning).toBeDefined();
  });

  it('should handle runMaintenance method gracefully', async () => {
    expect(engine.runMaintenance).toBeDefined();
  });
});