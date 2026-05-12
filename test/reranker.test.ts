/**
 * brain-memory — Reranker tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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

  // ─── Cosine similarity fallback with embedFn ─────────────────

  it('should rerank with cosine similarity when embedFn provided', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: false },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'python', description: 'programming language', content: 'Python is a programming language', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'javascript', description: 'web language', content: 'JavaScript is a web language', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n3', type: 'SKILL' as const, category: 'skills', name: 'rust', description: 'systems language', content: 'Rust is a systems language', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    // Simulate query vector close to python
    const queryVec = [1.0, 0.0, 0.0];
    const embedFn = vi.fn(async (text: string) => {
      if (text.includes('python')) return [0.9, 0.1, 0.0];
      if (text.includes('javascript')) return [0.3, 0.7, 0.0];
      if (text.includes('rust')) return [0.1, 0.1, 0.8];
      return [0.0, 0.0, 0.0];
    });

    const result = await reranker.rerank('python programming', queryVec, nodes, embedFn);

    expect(result.apiUsed).toBe(false);
    expect(result.nodes).toHaveLength(3);
    // python should be first (highest cosine similarity to query)
    expect(result.nodes[0].id).toBe('n1');
    expect(result.rerankScores.get('n1')).toBeGreaterThan(result.rerankScores.get('n3')!);
  });

  it('should handle embedFn that throws for some nodes', async () => {
    const config = { ...DEFAULT_CONFIG, rerank: { enabled: false } };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'TASK' as const, category: 'tasks', name: 'task1', description: 'desc', content: 'content', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'TASK' as const, category: 'tasks', name: 'task2', description: 'desc', content: 'content', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    const embedFn = vi.fn(async (text: string) => {
      if (text.includes('task1')) throw new Error('embed error');
      return [0.5, 0.5];
    });

    const result = await reranker.rerank('query', [0.5, 0.5], nodes, embedFn);
    // Should not throw; n1 skipped (no score in map), n2 scored
    expect(result.nodes).toHaveLength(2);
    expect(result.rerankScores.has('n1')).toBe(false);
    expect(result.rerankScores.has('n2')).toBe(true);
  });

  it('should skip cosine when embedFn is null', async () => {
    const config = { ...DEFAULT_CONFIG, rerank: { enabled: false } };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'b', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    const result = await reranker.rerank('query', [0.1, 0.2], nodes, null);
    expect(result.apiUsed).toBe(false);
    // Both have score 0, order unchanged
    expect(result.nodes).toHaveLength(2);
  });

  it('should skip cosine when queryVec is empty', async () => {
    const config = { ...DEFAULT_CONFIG, rerank: { enabled: false } };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'b', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    const embedFn = vi.fn(async () => [0.5, 0.5]);
    const result = await reranker.rerank('query', [], nodes, embedFn);
    expect(result.apiUsed).toBe(false);
    expect(result.nodes).toHaveLength(2);
  });

  // ─── API rerank path (mocked fetch) ─────────────────────────

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should call API and parse results when enabled with apiKey', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: {
        enabled: true,
        apiKey: 'test-key',
        provider: 'jina' as const,
        model: 'jina-reranker-v3',
        endpoint: 'https://api.jina.ai/v1/rerank',
        topK: 20,
      },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'python', description: 'desc', content: 'content', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'rust', description: 'desc', content: 'content', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.3 },
        ],
      }),
    }));

    const result = await reranker.rerank('python programming', [], nodes);
    expect(result.apiUsed).toBe(true);
    expect(result.nodes[0].id).toBe('n1'); // highest score first
    expect(result.rerankScores.get('n1')).toBe(0.9);
  });

  it('should fall back to cosine when API returns non-ok', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: {
        enabled: true,
        apiKey: 'test-key',
        provider: 'jina' as const,
      },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'b', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }));

    const embedFn = vi.fn(async () => [0.5, 0.5]);
    const result = await reranker.rerank('query', [0.5, 0.5], nodes, embedFn);
    expect(result.apiUsed).toBe(false); // fell back to cosine
  });

  it('should fall back to cosine when API throws error', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: 'test-key', provider: 'jina' as const },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const embedFn = vi.fn(async () => [0.5, 0.5]);
    const result = await reranker.rerank('query', [0.5, 0.5], nodes, embedFn);
    expect(result.apiUsed).toBe(false);
  });

  it('should use Api-Key header for pinecone provider', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: {
        enabled: true,
        apiKey: 'pinecone-key',
        provider: 'pinecone' as const,
        endpoint: 'https://api.pinecone.io/rerank',
        model: 'pinecone-rerank',
      },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'b', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ index: 0, relevance_score: 0.8 }, { index: 1, relevance_score: 0.3 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await reranker.rerank('query', [], nodes);
    expect(fetchMock).toHaveBeenCalled();
    const callArgs = fetchMock.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers['Api-Key']).toBe('pinecone-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('should handle API response with data field instead of results', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: 'test-key', provider: 'jina' as const },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: 'n2', type: 'SKILL' as const, category: 'skills', name: 'b', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ idx: 0, score: 0.7 }, { idx: 1, score: 0.4 }] }),
    }));

    const result = await reranker.rerank('query', [], nodes);
    expect(result.apiUsed).toBe(true);
    expect(result.rerankScores.get('n1')).toBe(0.7);
  });

  it('should return null fallback when API returns empty results', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: 'test-key', provider: 'jina' as const },
    };
    const reranker = new Reranker(config);

    const nodes = [
      { id: 'n1', type: 'SKILL' as const, category: 'skills', name: 'a', description: 'd', content: 'c', status: 'active' as const, validatedCount: 1, sourceSessions: ['s1'], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: 'static' as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }));

    const embedFn = vi.fn(async () => [0.5, 0.5]);
    const result = await reranker.rerank('query', [0.5, 0.5], nodes, embedFn);
    // Empty results → falls back to cosine
    expect(result.apiUsed).toBe(false);
  });
});