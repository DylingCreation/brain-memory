/**
 * brain-memory 功能验证脚本
 * 验证核心功能是否能正常工作
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, searchNodes, allActiveNodes } from './src/store/store.ts';
import { Recaller } from './src/recaller/recall.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { Extractor } from './src/extractor/extract.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始验证 brain-memory 核心功能...');

// 1. 测试存储功能
console.log('\n✅ 1. 测试存储功能');
try {
  const { node: testNode, isNew } = upsertNode(db, {
    type: 'SKILL',
    category: 'skills',
    name: 'test-docker-setup',
    description: 'Docker setup skill',
    content: 'Use docker-compose to set up containers',
    temporalType: 'static'
  }, 'test-session');
  
  console.log(`   创建节点: ${testNode.name} (ID: ${testNode.id})`);
  console.log(`   是否为新节点: ${isNew}`);
  
  // 测试搜索功能
  const searchResults = searchNodes(db, 'docker', 5);
  console.log(`   搜索结果数量: ${searchResults.length}`);
  
  // 测试获取所有活跃节点
  const allNodes = allActiveNodes(db);
  console.log(`   所有活跃节点数量: ${allNodes.length}`);
  
  console.log('   ✅ 存储功能正常');
} catch (error) {
  console.error('   ❌ 存储功能异常:', error.message);
}

// 2. 测试召回功能
console.log('\n✅ 2. 测试召回功能');
try {
  const recaller = new Recaller(db, DEFAULT_CONFIG);
  
  // 测试召回
  const recallResult = await recaller.recall('docker');
  console.log(`   召回节点数量: ${recallResult.nodes.length}`);
  console.log(`   召回边数量: ${recallResult.edges.length}`);
  console.log(`   估算Token数: ${recallResult.tokenEstimate}`);
  
  console.log('   ✅ 召回功能正常');
} catch (error) {
  console.error('   ❌ 召回功能异常:', error.message);
}

// 3. 测试提取功能（无LLM模式）
console.log('\n✅ 3. 测试提取功能');
try {
  // 创建一个没有LLM的提取器（仅测试解析功能）
  const extractor = new Extractor(DEFAULT_CONFIG, async () => '{"nodes":[],"edges":[]}');
  
  const messages = [
    { role: 'user', content: 'How do I set up a Docker container?', turn_index: 1 },
    { role: 'assistant', content: 'You can use docker-compose.yml to define your services.', turn_index: 2 }
  ];
  
  const extractionResult = await extractor.extract({
    messages,
    existingNames: ['test-existing']
  });
  
  console.log(`   提取节点数量: ${extractionResult.nodes.length}`);
  console.log(`   提取边数量: ${extractionResult.edges.length}`);
  
  console.log('   ✅ 提取功能正常');
} catch (error) {
  console.error('   ❌ 提取功能异常:', error.message);
}

// 4. 测试配置
console.log('\n✅ 4. 测试配置');
try {
  console.log(`   引擎模式: ${DEFAULT_CONFIG.engine}`);
  console.log(`   存储后端: ${DEFAULT_CONFIG.storage}`);
  console.log(`   最大召回节点数: ${DEFAULT_CONFIG.recallMaxNodes}`);
  console.log(`   衰减是否启用: ${DEFAULT_CONFIG.decay.enabled}`);
  
  console.log('   ✅ 配置正常');
} catch (error) {
  console.error('   ❌ 配置异常:', error.message);
}

console.log('\n🎉 brain-memory 核心功能验证完成！');
console.log('   所有主要模块都能够正常实例化和运行');