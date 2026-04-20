/**
 * brain-memory 知识融合测试
 * 验证相似节点的融合功能和节点合并与边关系维护
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, upsertEdge, allActiveNodes } from './src/store/store.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { 
  computeNameSimilarity, 
  findFusionCandidates, 
  parseFusionDecision,
  shouldRunFusion,
  runFusion
} from './src/fusion/analyzer.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始知识融合测试...');

// 1. 测试名称相似度分析功能
console.log('\n✅ 1. 测试名称相似度分析功能');

const nameSimTests = [
  { a: 'docker-container-setup', b: 'docker-container-setup', expected: 1.0, desc: '完全相同名称' },
  { a: 'docker port fix', b: 'fix docker port', expected: 1.0, desc: '相同词汇不同顺序' },
  { a: 'docker setup', b: 'docker configuration', expected: 0.33, desc: '部分重叠' },
  { a: 'docker deploy', b: 'python flask', expected: 0, desc: '完全不同' },
  { a: '数据库连接错误修复', b: '修复数据库连接错误', expected: 1.0, desc: '中文相同含义' }
];

for (const test of nameSimTests) {
  const sim = computeNameSimilarity(test.a, test.b);
  const passed = Math.abs(sim - test.expected) < 0.1;
  console.log(`   ${passed ? '✅' : '❌'} ${test.desc}: "${test.a}" vs "${test.b}" → ${sim.toFixed(2)} (期望: ~${test.expected})`);
}

// 2. 测试向量相似度分析功能
console.log('\n✅ 2. 测试向量相似度分析功能');

// 创建一些相似的节点用于测试
const { node: nodeA } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'docker-container-setup',
  description: 'Setting up Docker containers',
  content: 'Use docker-compose.yml to define services, networks, and volumes for container orchestration.',
  temporalType: 'static'
}, 'test-session');

const { node: nodeB } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'docker-container-configuration',
  description: 'Configuring Docker containers',
  content: 'Use docker-compose.yml to define services, networks, and volumes for container orchestration.',
  temporalType: 'static'
}, 'test-session');

const { node: nodeC } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'python-flask-deployment',
  description: 'Deploying Flask applications',
  content: 'Deploy Flask apps using Gunicorn and Nginx for production environments.',
  temporalType: 'static'
}, 'test-session');

console.log(`   创建了节点: ${nodeA.name}, ${nodeB.name}, ${nodeC.name}`);

// 测试融合候选发现功能
const candidates = findFusionCandidates(db, DEFAULT_CONFIG);
console.log(`   发现融合候选对数: ${candidates.length}`);

if (candidates.length > 0) {
  candidates.forEach((candidate, index) => {
    console.log(`     ${index + 1}. ${candidate.nodeA.name} ↔ ${candidate.nodeB.name} (相似度: ${candidate.combinedScore.toFixed(2)})`);
  });
}

// 3. 测试LLM决策融合功能
console.log('\n✅ 3. 测试LLM决策融合功能');

import { createLLMClient } from './llm_client.js';

const mockLLM = await createLLMClient();

// 直接测试解析功能
const decisionTests = [
  { input: '{"decision":"merge","reason":"same topic"}', expected: 'merge', desc: '合并决策' },
  { input: '{"decision":"link","reason":"related"}', expected: 'link', desc: '链接决策' },
  { input: '{"decision":"none","reason":"different"}', expected: 'none', desc: '无操作决策' },
  { input: 'not json', expected: 'none', desc: '无效JSON' },
  { input: '```json\n{"decision":"merge","reason":"test"}\n```', expected: 'merge', desc: '带代码块' }
];

for (const test of decisionTests) {
  const result = parseFusionDecision(test.input);
  const passed = result.decision === test.expected;
  console.log(`   ${passed ? '✅' : '❌'} ${test.desc}: "${test.input}" → ${result.decision} (期望: ${test.expected})`);
}

// 4. 测试节点合并和边关系维护
console.log('\n✅ 4. 测试节点合并和边关系维护');

// 创建一些边关系来测试合并后的边维护
upsertEdge(db, {
  fromId: nodeA.id,
  toId: nodeC.id,
  type: 'REQUIRES',
  instruction: 'Docker setup requires Flask deployment',
  sessionId: 'test-session'
});

upsertEdge(db, {
  fromId: nodeB.id,
  toId: nodeC.id,
  type: 'USED_SKILL',
  instruction: 'Used Docker config skill in deployment',
  sessionId: 'test-session'
});

console.log(`   为节点创建了边关系`);

// 检查是否满足融合运行条件
const canRunFusion = shouldRunFusion(db, DEFAULT_CONFIG);
console.log(`   是否满足融合运行条件 (最小节点数: ${DEFAULT_CONFIG.fusion.minNodes}): ${canRunFusion}`);

// 测试完整的融合流程（使用模拟的embedFn）
const fusionResult = await runFusion(db, DEFAULT_CONFIG, mockLLM, null, 'test-session');

console.log(`   融合结果: 合并了 ${fusionResult.merged} 个节点, 链接了 ${fusionResult.linked} 个节点`);
console.log(`   融合耗时: ${fusionResult.durationMs} 毫秒`);

// 检查融合后剩余的节点数
const remainingNodes = allActiveNodes(db);
console.log(`   融合后剩余节点数: ${remainingNodes.length}`);

// 5. 验证融合配置
console.log('\n✅ 5. 验证融合配置');

console.log(`   融合是否启用: ${DEFAULT_CONFIG.fusion.enabled}`);
console.log(`   相似度阈值: ${DEFAULT_CONFIG.fusion.similarityThreshold}`);
console.log(`   最小节点数要求: ${DEFAULT_CONFIG.fusion.minNodes}`);
console.log(`   最小社区数要求: ${DEFAULT_CONFIG.fusion.minCommunities}`);

console.log('\n🎉 知识融合测试完成！');