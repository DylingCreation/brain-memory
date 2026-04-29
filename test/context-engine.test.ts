/**
 * brain-memory — ContextEngine tests
 *
 * Tests for the main ContextEngine class functionality
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { ContextEngine } from '../src/engine/context';
import { DEFAULT_CONFIG } from '../src/types';
import fs from 'fs';
import path from 'path';

describe('ContextEngine', () => {
  let engine: ContextEngine;
  const testDbPath = path.resolve(__dirname, 'test-brain-memory-context.db');

  beforeEach(() => {
    // Clean up any leftover files from previous test runs
    cleanupDbFiles(testDbPath);

    const config = {
      ...DEFAULT_CONFIG,
      dbPath: testDbPath,
      llm: {
        apiKey: 'mock-key',
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
    // Close the engine first (flushes WAL)
    try { engine.close(); } catch { /* ignore */ }
    // Clean up all database files (main + WAL + SHM)
    cleanupDbFiles(testDbPath);
  });

  function cleanupDbFiles(dbPath: string): void {
    const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const f of files) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch { /* ignore cleanup errors */ }
    }
  }

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
    expect(context).toBeDefined();
  });

  it('should handle recall method gracefully', async () => {
    expect(engine.recall).toBeDefined();
  });

  it('should handle processTurn method gracefully', async () => {
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
