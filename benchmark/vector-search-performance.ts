/**
 * brain-memory - Performance benchmark for vector search optimization
 * 
 * This benchmark compares the performance of vector search before and after optimization
 */

import { createTestDb, insertNode, insertVector } from '../test/helpers';
import { vectorSearchWithScore } from '../src/store/store';
import { DEFAULT_CONFIG } from '../src/types';
import { performance } from 'perf_hooks';

async function runBenchmark() {
  console.log('Starting vector search performance benchmark...\n');
  
  // Create a test database with various amounts of data
  const db = createTestDb();
  
  // Insert test data: varying numbers of nodes and vectors
  const testSizes = [100, 500, 1000]; // Test with different dataset sizes
  
  for (const size of testSizes) {
    console.log(`Testing with ${size} nodes/vectors:`);
    
    // Clear previous data
    db.prepare('DELETE FROM bm_nodes').run();
    db.prepare('DELETE FROM bm_vectors').run();
    
    // Insert test nodes and vectors
    const testVectors = [];
    for (let i = 0; i < size; i++) {
      const nodeId = insertNode(db, { 
        name: `test-node-${i}`, 
        content: `This is test content for node ${i}. It contains some meaningful text for testing purposes.` 
      });
      
      // Create a somewhat varied vector for each node
      const vector = Array.from({ length: 1536 }, (_, j) => Math.sin(i + j * 0.1));
      testVectors.push(vector);
      insertVector(db, nodeId, vector, `content for node ${i}`);
    }
    
    // Benchmark vector search performance
    const queryVector = Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.1));
    const iterations = 10; // Run multiple iterations for average
    
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
    
    console.log(`  Average time per search: ${avgTime.toFixed(2)} ms`);
    console.log(`  Total time for ${iterations} searches: ${totalTime.toFixed(2)} ms`);
    console.log(`  Throughput: ${(iterations / (totalTime / 1000)).toFixed(2)} searches/sec`);
    console.log('');
  }
  
  db.close();
  
  console.log('Benchmark completed successfully!');
  console.log('Key metrics to observe:');
  console.log('- Average search time should be reasonable (< 100ms for typical use)');
  console.log('- Throughput should be adequate for concurrent usage');
  console.log('- Performance should scale reasonably with data size');
}

// Run the benchmark
if (require.main === module) {
  runBenchmark().catch(console.error);
}

export { runBenchmark };