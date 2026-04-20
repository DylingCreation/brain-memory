/**
 * brain-memory — Performance benchmark tests
 * 
 * Validates that performance optimizations are effective
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, insertNode, insertVector } from './helpers';
import { vectorSearchWithScore } from '../src/store/store';
import { performance } from 'perf_hooks';

describe('Performance Benchmarks', () => {
  let db: any;
  
  beforeEach(() => {
    db = createTestDb();
  });
  
  afterEach(() => {
    db.close();
  });

  it('vector search performance should be acceptable', () => {
    // Insert test data
    const nodeIds = [];
    for (let i = 0; i < 100; i++) {
      const nodeId = insertNode(db, { 
        name: `perf-test-node-${i}`, 
        content: `Performance test content ${i}. This is sample content for benchmarking performance.` 
      });
      nodeIds.push(nodeId);
      
      // Create vectors for each node
      const vector = Array.from({ length: 1536 }, (_, j) => Math.sin(i + j * 0.1));
      insertVector(db, nodeId, vector, `perf content for node ${i}`);
    }
    
    // Test vector search performance
    const queryVector = Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.1));
    
    const startTime = performance.now();
    const results = vectorSearchWithScore(db, queryVector, 10);
    const endTime = performance.now();
    
    const searchTime = endTime - startTime;
    
    console.log(`Vector search performance: ${searchTime.toFixed(2)} ms for ${nodeIds.length} nodes`);
    console.log(`Found ${results.length} results`);
    
    // Performance validation: search should complete in reasonable time
    // Even with 100 nodes, optimized search should complete quickly
    expect(searchTime).toBeLessThan(200); // Should complete in under 200ms
    
    // Results should be returned
    expect(Array.isArray(results)).toBe(true);
  });

  it('vector search should scale reasonably with data size', () => {
    const sizes = [50, 100, 200];
    const times: number[] = [];
    
    for (const size of sizes) {
      // Clear previous data - need to delete vectors first due to foreign key constraints
      db.prepare('DELETE FROM bm_vectors WHERE node_id IN (SELECT id FROM bm_nodes WHERE name LIKE ?)').run(`scale-test-${size}-%`);
      db.prepare('DELETE FROM bm_nodes WHERE name LIKE ?').run(`scale-test-${size}-%`);
      
      // Insert test data of specified size
      for (let i = 0; i < size; i++) {
        const nodeId = insertNode(db, { 
          name: `scale-test-${size}-node-${i}`, 
          content: `Scale test content ${i} for size ${size}.` 
        });
        
        // Create vectors for each node
        const vector = Array.from({ length: 1536 }, (_, j) => Math.sin(i + j * 0.1));
        insertVector(db, nodeId, vector, `scale content for node ${i} size ${size}`);
      }
      
      // Benchmark search
      const queryVector = Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.1));
      
      const startTime = performance.now();
      const results = vectorSearchWithScore(db, queryVector, 5);
      const endTime = performance.now();
      
      const searchTime = endTime - startTime;
      times.push(searchTime);
      
      console.log(`Size ${size}: ${searchTime.toFixed(2)} ms, ${results.length} results`);
      
      // Performance should be reasonable for all sizes
      expect(searchTime).toBeLessThan(500); // Should complete in under 500ms even for larger datasets
    }
    
    // Verify that times are reasonable and show acceptable scaling
    console.log(`Performance scaling: ${times.map(t => t.toFixed(2)).join('ms, ')}ms`);
  });

  it('database operations should be efficient', () => {
    const start = performance.now();
    
    // Test batch insert performance
    const batchCount = 50;
    for (let i = 0; i < batchCount; i++) {
      insertNode(db, { 
        name: `batch-test-node-${i}`, 
        content: `Batch test content ${i}. Efficient operations test.` 
      });
    }
    
    const insertTime = performance.now() - start;
    
    console.log(`Inserted ${batchCount} nodes in ${insertTime.toFixed(2)} ms (${(batchCount / (insertTime / 1000)).toFixed(2)}/sec)`);
    
    // Insertion should be efficient
    expect(insertTime).toBeLessThan(1000); // Should insert 50 nodes in under 1 second
  });
});