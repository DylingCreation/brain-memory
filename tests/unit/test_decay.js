/**
 * brain-memory 智能衰减功能测试
 * 验证Weibull衰减模型和不同重要性层级的衰减差异
 */

import { initDb } from './src/store/db.ts';
import { upsertNode } from './src/store/store.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { scoreDecay, applyTimeDecay } from './src/decay/engine.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始智能衰减功能测试...');

// 1. 测试Weibull衰减模型计算准确性
console.log('\n✅ 1. 测试Weibull衰减模型计算准确性');
const now = Date.now();

// 创建不同类型的重要性的节点
const { node: coreNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'core-skill',
  description: 'Core skill with high importance',
  content: 'This is a critical skill that should persist longer.',
  temporalType: 'static'
}, 'test-session');

// 手动设置重要性等级
db.prepare("UPDATE bm_nodes SET importance = 0.8, created_at = ?, updated_at = ? WHERE id = ?")
  .run(now - 7 * 24 * 60 * 60 * 1000, now, coreNode.id); // 7天前创建

const { node: workingNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'working-skill',
  description: 'Working skill with medium importance',
  content: 'This is a moderately important skill.',
  temporalType: 'static'
}, 'test-session');

db.prepare("UPDATE bm_nodes SET importance = 0.55, created_at = ?, updated_at = ? WHERE id = ?")
  .run(now - 7 * 24 * 60 * 60 * 1000, now, workingNode.id);

const { node: peripheralNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'peripheral-skill',
  description: 'Peripheral skill with low importance',
  content: 'This is a less important skill.',
  temporalType: 'static'
}, 'test-session');

db.prepare("UPDATE bm_nodes SET importance = 0.2, created_at = ?, updated_at = ? WHERE id = ?")
  .run(now - 7 * 24 * 60 * 60 * 1000, now, peripheralNode.id);

// 测试衰减分数计算
const coreScore = scoreDecay(coreNode, DEFAULT_CONFIG.decay, now);
const workingScore = scoreDecay(workingNode, DEFAULT_CONFIG.decay, now);
const peripheralScore = scoreDecay(peripheralNode, DEFAULT_CONFIG.decay, now);

console.log(`   Core节点(重要性0.8)衰减分数: ${coreScore.composite.toFixed(4)}`);
console.log(`   Working节点(重要性0.55)衰减分数: ${workingScore.composite.toFixed(4)}`);
console.log(`   Peripheral节点(重要性0.2)衰减分数: ${peripheralScore.composite.toFixed(4)}`);

// 2. 测试不同重要性层级的衰减差异
console.log('\n✅ 2. 测试不同重要性层级的衰减差异');
console.log(`   Core节点(recency: ${coreScore.recency.toFixed(4)}, frequency: ${coreScore.frequency.toFixed(4)}, intrinsic: ${coreScore.intrinsic.toFixed(4)})`);
console.log(`   Working节点(recency: ${workingScore.recency.toFixed(4)}, frequency: ${workingScore.frequency.toFixed(4)}, intrinsic: ${workingScore.intrinsic.toFixed(4)})`);
console.log(`   Peripheral节点(recency: ${peripheralScore.recency.toFixed(4)}, frequency: ${peripheralScore.frequency.toFixed(4)}, intrinsic: ${peripheralScore.intrinsic.toFixed(4)})`);

// 3. 测试动态信息比静态信息衰减更快
console.log('\n✅ 3. 测试动态信息比静态信息衰减更快');

// 创建相同重要性的动态和静态节点
const { node: staticNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'static-info',
  description: 'Static information',
  content: 'This is static information that should decay slowly.',
  temporalType: 'static'
}, 'test-session');

db.prepare("UPDATE bm_nodes SET importance = 0.6, created_at = ?, updated_at = ? WHERE id = ?")
  .run(now - 7 * 24 * 60 * 60 * 1000, now, staticNode.id);

const { node: dynamicNode } = upsertNode(db, {
  type: 'EVENT',
  category: 'events',
  name: 'dynamic-info',
  description: 'Dynamic information',
  content: 'This is dynamic information that should decay faster.',
  temporalType: 'dynamic'
}, 'test-session');

db.prepare("UPDATE bm_nodes SET importance = 0.6, created_at = ?, updated_at = ? WHERE id = ?")
  .run(now - 7 * 24 * 60 * 60 * 1000, now, dynamicNode.id);

const staticScore = scoreDecay(staticNode, DEFAULT_CONFIG.decay, now);
const dynamicScore = scoreDecay(dynamicNode, DEFAULT_CONFIG.decay, now);

console.log(`   静态信息节点衰减分数: ${staticScore.composite.toFixed(4)}`);
console.log(`   动态信息节点衰减分数: ${dynamicScore.composite.toFixed(4)}`);
console.log(`   静态信息衰减较慢: ${staticScore.composite > dynamicScore.composite ? '是' : '否'}`);

// 4. 测试衰减对召回排序的影响
console.log('\n✅ 4. 测试衰减对召回排序的影响');

// 模拟召回分数
const baseScore = 0.8;
const coreAdjusted = applyTimeDecay(baseScore, coreNode, DEFAULT_CONFIG.decay, now);
const workingAdjusted = applyTimeDecay(baseScore, workingNode, DEFAULT_CONFIG.decay, now);
const peripheralAdjusted = applyTimeDecay(baseScore, peripheralNode, DEFAULT_CONFIG.decay, now);

console.log(`   原始分数: ${baseScore}`);
console.log(`   Core节点调整后分数: ${coreAdjusted.toFixed(4)} (变化: ${(coreAdjusted - baseScore).toFixed(4)})`);
console.log(`   Working节点调整后分数: ${workingAdjusted.toFixed(4)} (变化: ${(workingAdjusted - baseScore).toFixed(4)})`);
console.log(`   Peripheral节点调整后分数: ${peripheralAdjusted.toFixed(4)} (变化: ${(peripheralAdjusted - baseScore).toFixed(4)})`);

console.log('\n🎉 智能衰减功能测试完成！');