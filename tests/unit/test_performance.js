/**
 * brain-memory 性能基准测试
 * 验证大量节点情况下的召回性能等
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, upsertEdge, allActiveNodes } from './src/store/store.ts';
import { Recaller } from './src/recaller/recall.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { computeGlobalPageRank } from './src/graph/pagerank.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始性能基准测试...');

// 1. 测试大量节点情况下的召回性能
console.log('\n✅ 1. 测试大量节点情况下的召回性能');

// 创建100个节点用于性能测试
console.log('   正在创建100个测试节点...');
const nodeIds = [];
for (let i = 0; i < 100; i++) {
  const { node } = upsertNode(db, {
    type: i % 3 === 0 ? 'SKILL' : i % 3 === 1 ? 'TASK' : 'EVENT',
    category: i % 4 === 0 ? 'skills' : i % 4 === 1 ? 'tasks' : i % 4 === 2 ? 'events' : 'preferences',
    name: `performance-test-node-${i}`,
    description: `Performance test node ${i} description`,
    content: `This is the content for performance test node ${i}. It contains various information for testing purposes. The content is sufficiently long to simulate real-world scenarios where nodes contain substantial amounts of text data.`,
    temporalType: i % 2 === 0 ? 'static' : 'dynamic'
  }, `perf-test-session-${i % 10}`);
  
  nodeIds.push(node.id);
}

const totalNodes = allActiveNodes(db).length;
console.log(`   成功创建了 ${totalNodes} 个节点`);

// 创建一些边关系
console.log('   正在创建边关系...');
for (let i = 0; i < 50; i++) {
  if (i + 1 < nodeIds.length) {
    upsertEdge(db, {
      fromId: nodeIds[i],
      toId: nodeIds[i + 1],
      type: i % 3 === 0 ? 'USED_SKILL' : i % 3 === 1 ? 'SOLVED_BY' : 'REQUIRES',
      instruction: `Edge from node ${i} to node ${i+1}`,
      sessionId: 'perf-test-session'
    });
  }
}

// 测试召回性能
const recaller = new Recaller(db, DEFAULT_CONFIG);

console.log('   测试召回性能...');
const startTime = Date.now();
const recallResult = await recaller.recall('performance test');
const recallTime = Date.now() - startTime;

console.log(`   召回结果: ${recallResult.nodes.length} 个节点, ${recallResult.edges.length} 条边`);
console.log(`   召回耗时: ${recallTime}ms`);

// 2. 测试大规模图上的PageRank计算性能
console.log('\n✅ 2. 测试大规模图上的PageRank计算性能');

console.log('   计算全局PageRank...');
const pageRankStartTime = Date.now();
const pageRankResult = computeGlobalPageRank(db, DEFAULT_CONFIG);
const pageRankTime = Date.now() - pageRankStartTime;

console.log(`   PageRank计算耗时: ${pageRankTime}ms`);
console.log(`   Top节点数量: ${pageRankResult.topK.length}`);
if (pageRankResult.topK.length > 0) {
  console.log(`   最高分节点: ${pageRankResult.topK[0].name} (得分: ${pageRankResult.topK[0].score.toFixed(4)})`);
}

// 3. 测试社区检测算法的性能表现
console.log('\n✅ 3. 测试社区检测算法的性能表现');

// 导入社区检测功能
import { detectCommunities, getCommunityPeers, communityRepresentatives } from './src/graph/community.ts';

console.log('   运行社区检测...');
const communityStartTime = Date.now();
const communities = detectCommunities(db, DEFAULT_CONFIG);
const communityTime = Date.now() - communityStartTime;

console.log(`   发现 ${communities.size} 个社区`);
console.log(`   社区检测耗时: ${communityTime}ms`);

// 测试社区代表节点获取
const reprStartTime = Date.now();
const representatives = communityRepresentatives(db, 5);
const reprTime = Date.now() - reprStartTime;

console.log(`   获取 ${representatives.length} 个社区代表节点`);
console.log(`   代表节点获取耗时: ${reprTime}ms`);

// 4. 测试搜索性能
console.log('\n✅ 4. 测试搜索性能');

console.log('   测试全文搜索性能...');
const searchStartTime = Date.now();
const searchResults = await new Promise(resolve => {
  setTimeout(() => {
    // 模拟搜索操作
    const results = allActiveNodes(db).filter(node => 
      node.name.includes('performance') || 
      node.description.includes('performance') || 
      node.content.includes('performance')
    );
    resolve(results);
  }, 0);
});
const searchTime = Date.now() - searchStartTime;

console.log(`   搜索结果: ${searchResults.length} 个节点`);
console.log(`   搜索耗时: ${searchTime}ms`);

// 5. 测试数据库操作性能
console.log('\n✅ 5. 测试数据库操作性能');

console.log('   测试批量插入性能...');
const batchStartTime = Date.now();
for (let i = 100; i < 150; i++) {
  upsertNode(db, {
    type: i % 3 === 0 ? 'SKILL' : i % 3 === 1 ? 'TASK' : 'EVENT',
    category: i % 4 === 0 ? 'skills' : i % 4 === 1 ? 'tasks' : i % 4 === 2 ? 'events' : 'preferences',
    name: `batch-test-node-${i}`,
    description: `Batch test node ${i} description`,
    content: `Content for batch test node ${i}`,
    temporalType: i % 2 === 0 ? 'static' : 'dynamic'
  }, `batch-test-session-${i % 10}`);
}
const batchTime = Date.now() - batchStartTime;

console.log(`   批量插入50个节点耗时: ${batchTime}ms`);

// 6. 输出性能指标汇总
console.log('\n📊 性能指标汇总:');
console.log(`   总节点数: ${allActiveNodes(db).length}`);
console.log(`   召回性能: ${recallResult.nodes.length} 个节点 in ${recallTime}ms (${(recallResult.nodes.length/(recallTime||1)*1000).toFixed(2)} nodes/sec)`);
console.log(`   PageRank性能: ${pageRankTime}ms for ${totalNodes} nodes`);
console.log(`   社区检测性能: ${communityTime}ms for ${totalNodes} nodes`);
console.log(`   搜索性能: ${searchTime}ms for ${searchResults.length} results`);
console.log(`   批量插入性能: ${batchTime}ms for 50 nodes (${(50/(batchTime||1)*1000).toFixed(2)} nodes/sec)`);

console.log('\n🎉 性能基准测试完成！');