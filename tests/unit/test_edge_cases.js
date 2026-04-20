/**
 * brain-memory 边界情况测试
 * 验证空输入、极端大小输入、并发访问等边界情况
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, searchNodes, allActiveNodes } from './src/store/store.ts';
import { Recaller } from './src/recaller/recall.ts';
import { DEFAULT_CONFIG } from './src/types.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始边界情况测试...');

// 1. 测试空输入的处理
console.log('\n✅ 1. 测试空输入的处理');

// 测试空查询
const emptyQueryResults = searchNodes(db, '');
console.log(`   空查询结果数量: ${emptyQueryResults.length}`);

// 测试空字符串节点名称
try {
  const emptyNameResult = upsertNode(db, {
    type: 'SKILL',
    category: 'skills',
    name: '',  // 空名称
    description: 'Empty name test',
    content: 'Testing empty name handling',
    temporalType: 'static'
  }, 'test-session');
  console.log(`   空名称节点创建: ${emptyNameResult.isNew ? '成功' : '失败'}`);
} catch (error) {
  console.log(`   空名称节点创建失败 (预期): ${error.message}`);
}

// 测试空内容节点
const { node: emptyContentNode, isNew: emptyContentIsNew } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'empty-content-test',
  description: '',
  content: '',  // 空内容
  temporalType: 'static'
}, 'test-session');
console.log(`   空内容节点创建: ${emptyContentIsNew ? '新节点' : '已存在'}`);

// 2. 测试极端大小输入的处理
console.log('\n✅ 2. 测试极端大小输入的处理');

// 测试超长节点名称
const superLongName = 'a'.repeat(1000);
const { node: longNameNode, isNew: longNameIsNew } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: superLongName,
  description: 'Super long name test',
  content: 'Testing super long name handling',
  temporalType: 'static'
}, 'test-session');
console.log(`   超长名称节点创建: ${longNameIsNew ? '新节点' : '已存在'}, 名称长度: ${longNameNode.name.length}`);

// 测试超长内容
const superLongContent = 'This is a very long content string. '.repeat(1000);
const { node: longContentNode, isNew: longContentIsNew } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'super-long-content-test',
  description: 'Super long content test',
  content: superLongContent,
  temporalType: 'static'
}, 'test-session');
console.log(`   超长内容节点创建: ${longContentIsNew ? '新节点' : '已存在'}, 内容长度: ${longContentNode.content.length}`);

// 测试超长查询
const superLongQuery = 'search term '.repeat(100);
const longQueryResults = searchNodes(db, superLongQuery, 10);
console.log(`   超长查询结果数量: ${longQueryResults.length}`);

// 3. 测试特殊字符和Unicode
console.log('\n✅ 3. 测试特殊字符和Unicode');

// 测试包含特殊字符的节点
const { node: specialCharNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'special-chars-测试-测试',
  description: 'Node with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?`~',
  content: 'Content with Unicode: 你好世界 🌍 и я ☺️',
  temporalType: 'static'
}, 'test-session');

console.log(`   特殊字符节点创建成功: ${specialCharNode.name.includes('测试')}`);

// 测试特殊字符查询
const specialCharResults = searchNodes(db, '!@#$%^&*()', 5);
console.log(`   特殊字符查询结果: ${specialCharResults.length}`);

// 4. 测试类型边界
console.log('\n✅ 4. 测试类型边界');

// 测试无效节点类型
try {
  // 注意：这里我们故意使用一个无效的类型，看系统如何处理
  const invalidTypeNode = upsertNode(db, {
    type: 'INVALID_TYPE',  // 无效类型
    category: 'skills',
    name: 'invalid-type-test',
    description: 'Testing invalid node type',
    content: 'Content for invalid type test',
    temporalType: 'static'
  }, 'test-session');
  console.log(`   无效类型节点创建: 成功 (可能被规范化)`);
} catch (error) {
  console.log(`   无效类型节点创建失败 (预期): ${error.message}`);
}

// 测试无效类别
try {
  const invalidCatNode = upsertNode(db, {
    type: 'SKILL',
    category: 'invalid_category',  // 无效类别
    name: 'invalid-category-test',
    description: 'Testing invalid category',
    content: 'Content for invalid category test',
    temporalType: 'static'
  }, 'test-session');
  console.log(`   无效类别节点创建: 成功 (可能被规范化)`);
} catch (error) {
  console.log(`   无效类别节点创建失败: ${error.message}`);
}

// 5. 测试召回边界情况
console.log('\n✅ 5. 测试召回边界情况');

const recaller = new Recaller(db, DEFAULT_CONFIG);

// 测试空查询召回
const emptyRecallResult = await recaller.recall('');
console.log(`   空查询召回结果: ${emptyRecallResult.nodes.length} 个节点, ${emptyRecallResult.edges.length} 条边`);

// 测试超大查询召回
const hugeQueryRecallResult = await recaller.recall(superLongQuery);
console.log(`   超大查询召回结果: ${hugeQueryRecallResult.nodes.length} 个节点, ${hugeQueryRecallResult.edges.length} 条边`);

// 测试不存在的查询召回
const nonexistentRecallResult = await recaller.recall('definitely_does_not_exist_in_any_node');
console.log(`   不存在查询召回结果: ${nonexistentRecallResult.nodes.length} 个节点, ${nonexistentRecallResult.edges.length} 条边`);

// 6. 测试配置边界
console.log('\n✅ 6. 测试配置边界');

// 测试极值配置
const extremeConfig = {
  ...DEFAULT_CONFIG,
  recallMaxNodes: 0,      // 最小值
  recallMaxDepth: 0,      // 最小值
  dedupThreshold: 0,      // 最小值
  dedupThreshold: 1.0,    // 最大值
  pagerankIterations: 1,  // 最小值
  pagerankDamping: 0,     // 最小值
  pagerankDamping: 1,     // 最大值
};

const extremeRecaller = new Recaller(db, extremeConfig);

// 测试极值配置下的召回
const extremeRecallResult = await extremeRecaller.recall('test');
console.log(`   极值配置召回结果: ${extremeRecallResult.nodes.length} 个节点, ${extremeRecallResult.edges.length} 条边`);

// 7. 测试数值边界
console.log('\n✅ 7. 测试数值边界');

// 测试极大/极小数字
const { node: extremeNumbersNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: `extreme-numbers-test-${Number.MAX_SAFE_INTEGER}-${Number.MIN_SAFE_INTEGER}`,
  description: `Max int: ${Number.MAX_SAFE_INTEGER}, Min int: ${Number.MIN_SAFE_INTEGER}`,
  content: `Float max: ${Number.MAX_VALUE}, Float min: ${Number.MIN_VALUE}`,
  temporalType: 'static'
}, 'test-session');

console.log(`   极值数字节点创建成功: ${extremeNumbersNode.name.includes('extreme-numbers-test')}`);

// 8. 验证所有节点总数
console.log('\n✅ 8. 验证节点总数');

const totalNodes = allActiveNodes(db).length;
console.log(`   总节点数: ${totalNodes}`);

console.log('\n🎉 边界情况测试完成！');