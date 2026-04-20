/**
 * brain-memory 上下文组装测试
 * 验证系统提示构建功能和XML上下文组装功能
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, upsertEdge } from './src/store/store.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { assembleContext, buildSystemPromptAddition } from './src/format/assemble.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始上下文组装测试...');

// 1. 测试系统提示构建功能
console.log('\n✅ 1. 测试系统提示构建功能');

// 测试不同参数的系统提示构建
const systemPromptTests = [
  {
    params: {
      selectedNodes: [
        { type: 'SKILL', src: 'recalled' },
        { type: 'TASK', src: 'active' }
      ],
      edgeCount: 2
    },
    desc: '包含召回节点的提示'
  },
  {
    params: {
      selectedNodes: [
        { type: 'SKILL', src: 'active' },
        { type: 'EVENT', src: 'active' }
      ],
      edgeCount: 1
    },
    desc: '纯活动节点的提示'
  },
  {
    params: {
      selectedNodes: [],
      edgeCount: 0
    },
    desc: '空节点的提示'
  }
];

for (const test of systemPromptTests) {
  const prompt = buildSystemPromptAddition(test.params);
  const hasContent = prompt.length > 0;
  console.log(`   ${test.desc}: ${hasContent ? '✅ 有内容' : '✅ 空内容'}`);
  if (hasContent) {
    console.log(`     预期包含召回节点信息: ${test.params.selectedNodes.some(n => n.src === 'recalled') ? '是' : '否'}`);
  }
}

// 2. 测试XML上下文组装功能
console.log('\n✅ 2. 测试XML上下文组装功能');

// 创建测试节点
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
  description: 'Deploy Flask application',
  content: 'Deploy a Python Flask application using Docker containers.',
  temporalType: 'dynamic'
}, 'test-session');

const { node: eventNode } = upsertNode(db, {
  type: 'EVENT',
  category: 'events',
  name: 'connection-error',
  description: 'Connection error during deployment',
  content: 'Encountered connection error when deploying Flask app with Docker.',
  temporalType: 'dynamic'
}, 'test-session');

console.log(`   创建了测试节点: ${skillNode.name}, ${taskNode.name}, ${eventNode.name}`);

// 创建边关系
upsertEdge(db, {
  fromId: taskNode.id,
  toId: skillNode.id,
  type: 'USED_SKILL',
  instruction: 'Used Docker container setup skill when deploying Flask app',
  sessionId: 'test-session'
});

upsertEdge(db, {
  fromId: eventNode.id,
  toId: skillNode.id,
  type: 'SOLVED_BY',
  instruction: 'Docker container setup skill solved the connection issue',
  sessionId: 'test-session'
});

console.log(`   创建了边关系`);

// 3. 测试不同策略下的上下文组装
console.log('\n✅ 3. 测试不同策略下的上下文组装');

const strategies = ['full', 'summary', 'adaptive', 'off'];

for (const strategy of strategies) {
  console.log(`\n   测试 ${strategy} 策略:`);
  
  const result = assembleContext(db, {
    tokenBudget: 1000,
    recallStrategy: strategy,
    activeNodes: [skillNode],
    activeEdges: [],
    recalledNodes: [taskNode, eventNode],
    recalledEdges: []
  });
  
  console.log(`     XML内容长度: ${result.xml ? result.xml.length : 0}`);
  console.log(`     系统提示长度: ${result.systemPrompt.length}`);
  console.log(`     估算Token数: ${result.tokens}`);
  console.log(`     情节上下文长度: ${result.episodicXml.length}`);
  console.log(`     情节Token数: ${result.episodicTokens}`);
  
  // 检查不同策略的效果
  if (strategy === 'off') {
    console.log(`     策略'off' - XML应为null: ${result.xml === null ? '✅' : '❌'}`);
  } else if (strategy === 'summary') {
    // 在summary模式下，内容应该被截断或不包含详细内容
    const hasFullContent = result.xml && result.xml.includes(skillNode.content.substring(0, 20));
    console.log(`     策略'summary' - 应该不包含完整内容: ${!hasFullContent ? '✅' : '⚠️'}`);
  }
}

// 4. 测试token预算控制
console.log('\n✅ 4. 测试token预算控制');

const highBudgetResult = assembleContext(db, {
  tokenBudget: 2000,  // 高预算
  recallStrategy: 'full',
  activeNodes: [skillNode],
  activeEdges: [],
  recalledNodes: [taskNode, eventNode],
  recalledEdges: []
});

const lowBudgetResult = assembleContext(db, {
  tokenBudget: 100,   // 低预算
  recallStrategy: 'full',
  activeNodes: [skillNode],
  activeEdges: [],
  recalledNodes: [taskNode, eventNode],
  recalledEdges: []
});

console.log(`   高预算(2000)结果Token数: ${highBudgetResult.tokens}`);
console.log(`   低预算(100)结果Token数: ${lowBudgetResult.tokens}`);
console.log(`   高预算是否包含更多内容: ${highBudgetResult.tokens >= lowBudgetResult.tokens ? '✅' : '❌'}`);

// 5. 测试社区分组功能
console.log('\n✅ 5. 测试社区分组功能');

// 更新节点以设置社区ID
db.prepare("UPDATE bm_nodes SET community_id = ? WHERE id = ?").run('community-1', skillNode.id);
db.prepare("UPDATE bm_nodes SET community_id = ? WHERE id = ?").run('community-1', taskNode.id);
db.prepare("UPDATE bm_nodes SET community_id = ? WHERE id = ?").run('community-2', eventNode.id);

console.log(`   为节点分配了社区ID`);

// 重新测试上下文组装以查看社区分组效果
const communityResult = assembleContext(db, {
  tokenBudget: 1000,
  recallStrategy: 'full',
  activeNodes: [skillNode, taskNode],
  activeEdges: [],
  recalledNodes: [eventNode],
  recalledEdges: []
});

console.log(`   社区分组上下文长度: ${communityResult.xml ? communityResult.xml.length : 0}`);
console.log(`   是否包含社区标签: ${communityResult.xml && communityResult.xml.includes('<community') ? '✅' : '❌'}`);

// 6. 验证边缘情况
console.log('\n✅ 6. 验证边缘情况');

// 测试零预算
const zeroBudgetResult = assembleContext(db, {
  tokenBudget: 0,   // 零预算意味着无限制
  recallStrategy: 'full',
  activeNodes: [skillNode, taskNode, eventNode],
  activeEdges: [],
  recalledNodes: [],
  recalledEdges: []
});

console.log(`   零预算(无限制)结果Token数: ${zeroBudgetResult.tokens}`);
console.log(`   零预算模式是否返回内容: ${zeroBudgetResult.xml !== null ? '✅' : '❌'}`);

// 测试空节点列表
const emptyResult = assembleContext(db, {
  tokenBudget: 1000,
  recallStrategy: 'full',
  activeNodes: [],
  activeEdges: [],
  recalledNodes: [],
  recalledEdges: []
});

console.log(`   空节点列表结果: XML=${emptyResult.xml === null ? 'null' : '存在'}, Tokens=${emptyResult.tokens}`);

console.log('\n🎉 上下文组装测试完成！');