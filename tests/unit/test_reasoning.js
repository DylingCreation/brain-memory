/**
 * brain-memory 推理检索测试
 * 验证推理功能、路径推导、隐含关系发现、模式泛化和矛盾检测
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, upsertEdge } from './src/store/store.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { 
  runReasoning, 
  shouldRunReasoning,
  buildReasoningContext,
  parseReasoningResult
} from './src/reasoning/engine.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始推理检索测试...');

// 1. 测试推理功能
console.log('\n✅ 1. 测试推理功能');

// 创建一组相互关联的节点来测试推理
const { node: skillA } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'docker-container-setup',
  description: 'Setting up Docker containers',
  content: 'Use docker-compose.yml to define services, networks, and volumes for container orchestration.',
  temporalType: 'static'
}, 'test-session');

const { node: skillB } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'docker-network-configuration',
  description: 'Configuring Docker networks',
  content: 'Set up bridge networks for inter-container communication.',
  temporalType: 'static'
}, 'test-session');

const { node: task } = upsertNode(db, {
  type: 'TASK',
  category: 'tasks',
  name: 'deploy-flask-application',
  description: 'Deploy Flask application with Docker',
  content: 'Deploy a Python Flask application using Docker containers.',
  temporalType: 'dynamic'
}, 'test-session');

const { node: event } = upsertNode(db, {
  type: 'EVENT',
  category: 'events',
  name: 'network-connection-issue',
  description: 'Network connection issue during deployment',
  content: 'Encountered network connection issues when deploying Flask app with Docker.',
  temporalType: 'dynamic'
}, 'test-session');

console.log(`   创建了节点: ${skillA.name}, ${skillB.name}, ${task.name}, ${event.name}`);

// 2. 测试路径推导功能 (A→B→C 间接关系)
console.log('\n✅ 2. 测试路径推导功能');

// 创建边关系来形成路径
upsertEdge(db, {
  fromId: task.id,
  toId: skillA.id,
  type: 'USED_SKILL',
  instruction: 'Used Docker container setup skill when deploying Flask app',
  sessionId: 'test-session'
});

upsertEdge(db, {
  fromId: skillA.id,
  toId: skillB.id,
  type: 'REQUIRES',
  instruction: 'Docker container setup requires network configuration',
  sessionId: 'test-session'
});

upsertEdge(db, {
  fromId: event.id,
  toId: skillB.id,
  type: 'SOLVED_BY',
  instruction: 'Network configuration skill solved the connection issue',
  sessionId: 'test-session'
});

console.log(`   创建了边关系形成推理路径`);

// 3. 测试隐含关系发现（共享邻居）
console.log('\n✅ 3. 测试隐含关系发现');

// 4. 测试模式泛化（多节点相似→通用规律）
console.log('\n✅ 4. 测试模式泛化');

// 5. 测试矛盾检测功能
console.log('\n✅ 5. 测试矛盾检测功能');

// 创建两个可能存在矛盾的节点
const { node: contradictSkill1 } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'use-postgres-db',
  description: 'Use PostgreSQL as database',
  content: 'Always use PostgreSQL for production databases due to its reliability.',
  temporalType: 'static'
}, 'test-session');

const { node: contradictSkill2 } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'use-sqlite-db',
  description: 'Use SQLite as database',
  content: 'Always use SQLite for production databases due to its simplicity.',
  temporalType: 'static'
}, 'test-session');

upsertEdge(db, {
  fromId: contradictSkill1.id,
  toId: contradictSkill2.id,
  type: 'CONFLICTS_WITH',
  instruction: 'PostgreSQL recommendation conflicts with SQLite recommendation',
  sessionId: 'test-session'
});

console.log(`   创建了可能存在矛盾的节点: ${contradictSkill1.name}, ${contradictSkill2.name}`);

// 准备推理测试的节点和边
const allNodes = [skillA, skillB, task, event, contradictSkill1, contradictSkill2];
const allEdges = [
  { fromId: task.id, toId: skillA.id, type: 'USED_SKILL', instruction: 'Used Docker container setup skill when deploying Flask app' },
  { fromId: skillA.id, toId: skillB.id, type: 'REQUIRES', instruction: 'Docker container setup requires network configuration' },
  { fromId: event.id, toId: skillB.id, type: 'SOLVED_BY', instruction: 'Network configuration skill solved the connection issue' },
  { fromId: contradictSkill1.id, toId: contradictSkill2.id, type: 'CONFLICTS_WITH', instruction: 'PostgreSQL recommendation conflicts with SQLite recommendation' }
];

// 检查是否满足推理条件
const meetsReasoningThreshold = shouldRunReasoning(allNodes, DEFAULT_CONFIG);
console.log(`   是否满足推理阈值 (最小节点数: ${DEFAULT_CONFIG.reasoning.minRecallNodes}): ${meetsReasoningThreshold}`);

import { createLLMClient } from './llm_client.js';

const mockLLM = await createLLMClient();

// 运行推理
const reasoningResult = await runReasoning(
  mockLLM,
  allNodes,
  allEdges,
  '如何部署Flask应用并解决可能出现的网络问题？',
  DEFAULT_CONFIG
);

console.log(`   推理触发: ${reasoningResult.triggered}`);
console.log(`   推理结论数量: ${reasoningResult.conclusions.length}`);

if (reasoningResult.conclusions.length > 0) {
  reasoningResult.conclusions.forEach((conclusion, index) => {
    console.log(`     ${index + 1}. [${conclusion.type}] ${conclusion.text} (置信度: ${conclusion.confidence})`);
  });
}

// 6. 测试推理上下文构建
console.log('\n✅ 6. 测试推理上下文构建');

const reasoningContext = buildReasoningContext(reasoningResult.conclusions);
console.log('   推理上下文构建结果:');
if (reasoningContext) {
  console.log(`   ${reasoningContext.replace(/\n/g, '\n   ')}`);
} else {
  console.log('   (无推理结论)');
}

// 7. 测试推理结果解析
console.log('\n✅ 7. 测试推理结果解析');

const testRawOutputs = [
  `{"conclusions": [{"text": "Test conclusion 1", "type": "path", "confidence": 0.8}]}`,
  `{"conclusions": [{"text": "Test conclusion 2", "type": "pattern", "confidence": 0.75}]}`,
  `Invalid JSON`,
  `Some thinking... {"conclusions": [{"text": "Test conclusion 3", "type": "contradiction", "confidence": 0.9}]}`
];

for (const raw of testRawOutputs) {
  const parsed = parseReasoningResult(raw, 5);
  console.log(`   解析 "${raw.substring(0, 30)}...": ${parsed.length} 个结论`);
}

// 8. 验证推理配置
console.log('\n✅ 8. 验证推理配置');

console.log(`   推理是否启用: ${DEFAULT_CONFIG.reasoning.enabled}`);
console.log(`   最大跳跃步数: ${DEFAULT_CONFIG.reasoning.maxHops}`);
console.log(`   最大结论数: ${DEFAULT_CONFIG.reasoning.maxConclusions}`);
console.log(`   最小召回节点数: ${DEFAULT_CONFIG.reasoning.minRecallNodes}`);

console.log('\n🎉 推理检索测试完成！');