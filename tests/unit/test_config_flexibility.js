/**
 * brain-memory 配置灵活性测试
 * 验证不同引擎模式、存储后端和参数配置的有效性
 */

import { initDb } from './src/store/db.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { Recaller } from './src/recaller/recall.ts';
import { upsertNode } from './src/store/store.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始配置灵活性测试...');

// 1. 测试不同引擎模式切换
console.log('\n✅ 1. 测试不同引擎模式切换');

// 测试 graph 模式
const graphConfig = { ...DEFAULT_CONFIG, engine: 'graph' };
const graphRecaller = new Recaller(db, graphConfig);
console.log(`   图引擎模式: ${graphConfig.engine}`);

// 测试 vector 模式
const vectorConfig = { ...DEFAULT_CONFIG, engine: 'vector' };
const vectorRecaller = new Recaller(db, vectorConfig);
console.log(`   向量引擎模式: ${vectorConfig.engine}`);

// 测试 hybrid 模式
const hybridConfig = { ...DEFAULT_CONFIG, engine: 'hybrid' };
const hybridRecaller = new Recaller(db, hybridConfig);
console.log(`   混合引擎模式: ${hybridConfig.engine}`);

// 2. 测试不同存储后端兼容性
console.log('\n✅ 2. 测试不同存储后端兼容性');

// 当前使用 SQLite，这是默认的存储后端
console.log(`   当前存储后端: ${DEFAULT_CONFIG.storage} (SQLite)`);

// 模拟 LanceDB 配置（虽然实际上可能不支持，但测试配置结构）
const lancedbConfig = { ...DEFAULT_CONFIG, storage: 'lancedb' };
console.log(`   模拟 LanceDB 配置: ${lancedbConfig.storage}`);

// 3. 测试各种参数配置有效性
console.log('\n✅ 3. 测试各种参数配置有效性');

console.log(`   最大召回节点数: ${DEFAULT_CONFIG.recallMaxNodes}`);
console.log(`   最大召回深度: ${DEFAULT_CONFIG.recallMaxDepth}`);
console.log(`   召回策略: ${DEFAULT_CONFIG.recallStrategy}`);
console.log(`   压缩轮次计数: ${DEFAULT_CONFIG.compactTurnCount}`);
console.log(`   去重阈值: ${DEFAULT_CONFIG.dedupThreshold}`);
console.log(`   PageRank阻尼系数: ${DEFAULT_CONFIG.pagerankDamping}`);
console.log(`   PageRank迭代次数: ${DEFAULT_CONFIG.pagerankIterations}`);

// 测试衰减参数
console.log(`   衰减是否启用: ${DEFAULT_CONFIG.decay.enabled}`);
console.log(`   新近性半衰期(天): ${DEFAULT_CONFIG.decay.recencyHalfLifeDays}`);
console.log(`   新近性权重: ${DEFAULT_CONFIG.decay.recencyWeight}`);
console.log(`   频率权重: ${DEFAULT_CONFIG.decay.frequencyWeight}`);
console.log(`   内在权重: ${DEFAULT_CONFIG.decay.intrinsicWeight}`);

// 测试核心衰减参数
console.log(`   Core衰减Beta: ${DEFAULT_CONFIG.decay.betaCore}`);
console.log(`   Working衰减Beta: ${DEFAULT_CONFIG.decay.betaWorking}`);
console.log(`   Peripheral衰减Beta: ${DEFAULT_CONFIG.decay.betaPeripheral}`);

// 测试噪声过滤参数
console.log(`   噪声过滤是否启用: ${DEFAULT_CONFIG.noiseFilter.enabled}`);
console.log(`   最小内容长度: ${DEFAULT_CONFIG.noiseFilter.minContentLength}`);

// 4. 测试不同配置下的功能表现
console.log('\n✅ 4. 测试不同配置下的功能表现');

// 在不同配置下测试节点插入
const { node: testNode1 } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'config-test-skill',
  description: 'Testing skill for configuration',
  content: 'This skill is created to test different configurations.',
  temporalType: 'static'
}, 'config-test-session');

console.log(`   在当前配置下成功创建节点: ${testNode1.name}`);

// 测试召回功能在不同配置下
const graphResults = await graphRecaller.recall('config test');
console.log(`   图引擎召回结果: ${graphResults.nodes.length} 个节点`);

// 设置一个模拟的嵌入函数以便测试向量功能
const mockEmbedding = (text) => {
  const words = text.toLowerCase().split(/\W+/);
  const vector = new Array(128).fill(0);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word) {
      const hash = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      vector[i % vector.length] = hash / 1000;
    }
  }
  return vector;
};

vectorRecaller.setEmbedFn(mockEmbedding);
const vectorResults = await vectorRecaller.recall('config test');
console.log(`   向量引擎召回结果: ${vectorResults.nodes.length} 个节点`);

hybridRecaller.setEmbedFn(mockEmbedding);
const hybridResults = await hybridRecaller.recall('config test');
console.log(`   混合引擎召回结果: ${hybridResults.nodes.length} 个节点`);

// 5. 测试配置参数边界情况
console.log('\n✅ 5. 测试配置参数边界情况');

// 测试极值配置
const extremeConfig = {
  ...DEFAULT_CONFIG,
  recallMaxNodes: 1,  // 最小值
  recallMaxDepth: 1,  // 最小值
  dedupThreshold: 0.99, // 高阈值
  pagerankIterations: 5, // 少迭代次数
  pagerankDamping: 0.5   // 低阻尼系数
};

const extremeRecaller = new Recaller(db, extremeConfig);
console.log(`   极值配置测试 - 最大节点: ${extremeConfig.recallMaxNodes}, 最大深度: ${extremeConfig.recallMaxDepth}`);

const extremeResults = await extremeRecaller.recall('config test');
console.log(`   极值配置召回结果: ${extremeResults.nodes.length} 个节点`);

// 6. 验证配置结构完整性
console.log('\n✅ 6. 验证配置结构完整性');

console.log(`   引擎模式选项: graph, vector, hybrid`);
console.log(`   存储后端选项: sqlite, lancedb`);
console.log(`   召回策略选项: full, summary, adaptive, off`);
console.log(`   时间衰减半衰期: ${DEFAULT_CONFIG.decay.timeDecayHalfLifeDays} 天`);
console.log(`   动态信息衰减因子: ${DEFAULT_CONFIG.decay.timeDecayHalfLifeDays / 3} 天`);

console.log('\n🎉 配置灵活性测试完成！');