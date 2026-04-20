/**
 * brain-memory — Reranker tests
 */

import { describe, it, expect } from 'vitest';
import { Reranker } from '../src/retriever/reranker';
import { DEFAULT_CONFIG } from '../src/types';

describe('Reranker', () => {
  it('should initialize with config', () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: {
        enabled: true,
        model: 'jina-reranker-v3',
        provider: 'jina' as const,
        topK: 20,
      }
    };
    
    const reranker = new Reranker(config);
    expect(reranker).toBeDefined();
  });

  it('should handle rerank with empty nodes', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: {
        enabled: false, // Disable API calls
      }
    };
    
    const reranker = new Reranker(config);
    const result = await reranker.rerank('test query', [0.1, 0.2, 0.3], []);
    
    expect(result).toBeDefined();
    expect(result.nodes).toEqual([]);
    expect(result.rerankScores).toBeInstanceOf(Map);
    expect(result.apiUsed).toBe(false);
  });

  it('should handle rerank with single node', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: {
        enabled: false, // Disable API calls
      }
    };
    
    const mockNode = {
      id: 'test-node',
      type: 'SKILL',
      category: 'skills',
      name: 'test skill',
      description: 'test description',
      content: 'test content',
      status: 'active',
      validatedCount: 1,
      sourceSessions: ['session1'],
      communityId: null,
      pagerank: 0,
      importance: 0.5,
      accessCount: 0,
      lastAccessedAt: 0,
      temporalType: 'static' as const,
      scopeSession: null,
      scopeAgent: null,
      scopeWorkspace: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const reranker = new Reranker(config);
    const result = await reranker.rerank('test query', [0.1, 0.2, 0.3], [mockNode]);
    
    expect(result).toBeDefined();
    expect(result.nodes).toHaveLength(1);
    expect(result.rerankScores).toBeInstanceOf(Map);
    expect(result.apiUsed).toBe(false);
  });
});