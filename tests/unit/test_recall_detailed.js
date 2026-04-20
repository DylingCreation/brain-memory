/**
 * brain-memory 详细召回功能测试
 * 测试图召回引擎、向量召回引擎和混合召回引擎
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, upsertEdge } from './src/store/store.ts';
import { Recaller } from './src/recaller/recall.ts';
import { DEFAULT_CONFIG } from './src/types.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始详细召回功能测试...');

// 1. 创建测试节点
console.log('\n✅ 1. 创建测试节点');
const { node: skillNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'docker-container-setup',
  description: 'Setting up Docker containers',
  content: 'Use docker-compose.yml to define services, networks, and volumes for container orchestration.',
  temporalType: 'static'
}, 'test-session');

const { node: taskNode } = upsertNode(db, {
  type: 'TASK',
  category: 'tasks',
  name: 'deploy-flask-app',
  description: 'Deploy Flask application with Docker',
  content: 'Deploying a Python Flask app using Docker containers for easy scaling.',
  temporalType: 'dynamic'
}, 'test-session');

const { node: eventNode } = upsertNode(db, {
  type: 'EVENT',
  category: 'events',
  name: 'database-connection-error',
  description: 'Database connection error during deployment',
  content: 'Error connecting to PostgreSQL database during Flask app deployment. Solution involved checking environment variables and network configuration.',
  temporalType: 'dynamic'
}, 'test-session');

console.log(`   创建了 ${skillNode.name} 技能节点`);
console.log(`   创建了 ${taskNode.name} 任务节点`);
console.log(`   创建了 ${eventNode.name} 事件节点`);

// 2. 创建测试边
console.log('\n✅ 2. 创建测试边');
upsertEdge(db, {
  fromId: taskNode.id,
  toId: skillNode.id,
  type: 'USED_SKILL',
  instruction: 'Use Docker container setup skill when deploying the Flask app',
  sessionId: 'test-session'
});

upsertEdge(db, {
  fromId: eventNode.id,
  toId: skillNode.id,
  type: 'SOLVED_BY',
  instruction: 'Docker container setup solved the deployment issue',
  sessionId: 'test-session'
});

console.log('   创建了 USED_SKILL 边');
console.log('   创建了 SOLVED_BY 边');

// 3. 测试图召回引擎
console.log('\n✅ 3. 测试图召回引擎');
const graphRecaller = new Recaller(db, {
  ...DEFAULT_CONFIG,
  engine: 'graph'
});

const graphResult = await graphRecaller.recall('docker');
console.log(`   图召回引擎结果: ${graphResult.nodes.length} 个节点, ${graphResult.edges.length} 条边`);
console.log(`   估算 Token 数: ${graphResult.tokenEstimate}`);

// 4. 测试向量召回引擎
console.log('\n✅ 4. 测试向量召回引擎');
const vectorRecaller = new Recaller(db, {
  ...DEFAULT_CONFIG,
  engine: 'vector'
});

import { createEmbeddingClient } from './llm_client.js';

const mockEmbedding = await createEmbeddingClient();

vectorRecaller.setEmbedFn(mockEmbedding);

const vectorResult = await vectorRecaller.recall('container deployment');
console.log(`   向量召回引擎结果: ${vectorResult.nodes.length} 个节点, ${vectorResult.edges.length} 条边`);
console.log(`   估算 Token 数: ${vectorResult.tokenEstimate}`);

// 5. 测试混合召回引擎
console.log('\n✅ 5. 测试混合召回引擎');
const hybridRecaller = new Recaller(db, {
  ...DEFAULT_CONFIG,
  engine: 'hybrid'
});

hybridRecaller.setEmbedFn(mockEmbedding);

const hybridResult = await hybridRecaller.recall('database error');
console.log(`   混合召回引擎结果: ${hybridResult.nodes.length} 个节点, ${hybridResult.edges.length} 条边`);
console.log(`   估算 Token 数: ${hybridResult.tokenEstimate}`);

// 6. 测试个性化 PageRank 排序
console.log('\n✅ 6. 测试个性化 PageRank 排序');
const pagerankResult = await graphRecaller.recall('docker deployment');
console.log(`   PageRank 排序结果: ${pagerankResult.nodes.length} 个节点`);
if (pagerankResult.nodes.length > 0) {
  console.log('   排名前几位的节点:');
  pagerankResult.nodes.slice(0, 3).forEach((node, index) => {
    console.log(`     ${index + 1}. ${node.name} (pagerank: ${node.pagerank.toFixed(4)})`);
  });
}

console.log('\n🎉 详细召回功能测试完成！');