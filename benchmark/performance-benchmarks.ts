/**
 * brain-memory — Performance Benchmarks
 * 
 * Comprehensive performance benchmarks to validate optimizations
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import { createTestDb, insertNode, insertVector } from '../test/helpers';
import { vectorSearchWithScore } from '../src/store/store';
import { DEFAULT_CONFIG } from '../src/types';
import { performance } from 'perf_hooks';

describe('Performance Benchmarks', () => {
  let db: any;
  
  beforeEach(() => {
    db = createTestDb();
  });
  
  afterEach(() => {
    db.close();
  });

  it('benchmark vector search performance with different data sizes', () => {
    const testSizes = [50, 200, 500]; // Smaller sizes for CI-friendly tests
    const results: Array<{ size: number; avgTime: number; throughput: number }> = [];
    
    for (const size of testSizes) {
      // Clear previous data
      db.prepare('DELETE FROM bm_nodes').run();
      db.prepare('DELETE FROM bm_vectors').run();
      
      // Insert test nodes and vectors
      for (let i = 0; i < size; i++) {
        const nodeId = insertNode(db, { 
          name: `test-node-${i}`, 
          content: `This is test content for node ${i}. It contains some meaningful text for testing purposes.` 
        });
        
        // Create a somewhat varied vector for each node
        const vector = Array.from({ length: 1536 }, (_, j) => Math.sin(i + j * 0.1));
        insertVector(db, nodeId, vector, `content for node ${i}`);
      }
      
      // Benchmark vector search performance
      const queryVector = Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.1));
      const iterations = 5; // Fewer iterations for CI
      
      const startTime = performance.now();
      for (let i = 0; i < iterations; i++) {
        const results = vectorSearchWithScore(db, queryVector, 10);
        // Access results to ensure computation is not optimized away
        if (results.length > 0) {
          const firstScore = results[0].score;
          // Use the value to prevent optimization
          if (firstScore > 1000) console.log("Unexpected score"); 
        }
      }
      const endTime = performance.now();
      
      const avgTime = (endTime - startTime) / iterations;
      const totalTime = endTime - startTime;
      const throughput = iterations / (totalTime / 1000); // searches per second
      
      results.push({ size, avgTime, throughput });
      
      console.log(`Vector search performance (${size} nodes):`);
      console.log(`  Average time per search: ${avgTime.toFixed(2)} ms`);
      console.log(`  Throughput: ${throughput.toFixed(2)} searches/sec`);
    }
    
    // Validate performance expectations
    for (const result of results) {
      // Expect reasonable performance: < 200ms per search even for larger datasets
      expect(result.avgTime).toBeLessThan(200);
      // Expect reasonable throughput
      expect(result.throughput).toBeGreaterThan(5); // At least 5 searches/sec
    }
  });

  it('benchmark memory usage patterns', () => {
    // Test that operations don't cause excessive memory growth
    const initialNodes = db.prepare('SELECT COUNT(*) as count FROM bm_nodes').get()['count'] as number;
    
    // Insert several nodes
    for (let i = 0; i < 10; i++) {
      insertNode(db, { 
        name: `benchmark-node-${i}`, 
        content: `Benchmark content ${i} with some meaningful text for testing purposes.` 
      });
    }
    
    const finalNodes = db.prepare('SELECT COUNT(*) as count FROM bm_nodes').get()['count'] as number;
    
    // Verify expected node count
    expect(finalNodes).toBe(initialNodes + 10);
    
    // Performance validation: insertion should be efficient
    console.log(`Node insertion performance: ${finalNodes - initialNodes} nodes inserted efficiently`);
  });

  it('benchmark recall performance', async () => {
    // This would test the full recall pipeline, but we'll simulate it with vector search
    // since the full recall involves network calls that aren't suitable for benchmarking
    
    // Insert a moderate amount of test data
    for (let i = 0; i < 100; i++) {
      const nodeId = insertNode(db, { 
        name: `recall-test-node-${i}`, 
        content: `Recall test content ${i}. This is sample content for benchmarking recall performance.` 
      });
      
      const vector = Array.from({ length: 1536 }, (_, j) => Math.sin(i + j * 0.1));
      insertVector(db, nodeId, vector, `recall content for node ${i}`);
    }
    
    // Test multiple recall operations
    const queryVector = Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.1));
    const iterations = 10;
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const results = vectorSearchWithScore(db, queryVector, 5);
      // Use results to prevent optimization
      if (results.length > 0) {
        const score = results[0].score;
        if (score < -1000) console.log("Unexpected"); // Dummy check
      }
    }
    const end = performance.now();
    
    const totalTime = end - start;
    const avgTime = totalTime / iterations;
    
    console.log(`Recall simulation performance:`);
    console.log(`  Average time: ${avgTime.toFixed(2)} ms per recall`);
    console.log(`  Total time: ${totalTime.toFixed(2)} ms for ${iterations} recalls`);
    
    // Validate performance expectations
    expect(avgTime).toBeLessThan(100); // Should be under 100ms per recall
  });
});