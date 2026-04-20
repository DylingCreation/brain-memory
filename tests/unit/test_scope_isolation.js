/**
 * brain-memory 多租户隔离测试
 * 验证session/agent/workspace级别的隔离和作用域过滤功能
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, searchNodes, allActiveNodes } from './src/store/store.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { 
  scopesMatch, 
  scopeKey, 
  buildScopeFilterClause, 
  DEFAULT_SCOPE_FILTER 
} from './src/scope/isolation.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始多租户隔离测试...');

// 1. 测试session级别的隔离
console.log('\n✅ 1. 测试session级别的隔离');

// 创建不同session的节点
const { node: sessionANode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'session-a-skill',
  description: 'Skill for session A',
  content: 'This skill belongs to session A only.',
  temporalType: 'static'
}, 'session-A');

const { node: sessionBNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'session-b-skill',
  description: 'Skill for session B',
  content: 'This skill belongs to session B only.',
  temporalType: 'static'
}, 'session-B');

console.log(`   创建了Session A节点: ${sessionANode.name}`);
console.log(`   创建了Session B节点: ${sessionBNode.name}`);

// 2. 测试agent级别的隔离
console.log('\n✅ 2. 测试agent级别的隔离');

// 模拟为节点设置不同的agent范围（通过更新数据库实现）
db.prepare("UPDATE bm_nodes SET scope_agent = ? WHERE id = ?").run('agent-1', sessionANode.id);
db.prepare("UPDATE bm_nodes SET scope_agent = ? WHERE id = ?").run('agent-2', sessionBNode.id);

console.log(`   为节点设置Agent范围: ${sessionANode.name} -> agent-1, ${sessionBNode.name} -> agent-2`);

// 3. 测试workspace级别的隔离
console.log('\n✅ 3. 测试workspace级别的隔离');

// 为节点设置不同的workspace范围
const { node: workspaceXNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'workspace-x-skill',
  description: 'Skill for workspace X',
  content: 'This skill belongs to workspace X only.',
  temporalType: 'static',
  scopeSession: 'shared-session',
  scopeAgent: 'shared-agent',
  scopeWorkspace: 'workspace-X'
}, 'shared-session');

const { node: workspaceYNode } = upsertNode(db, {
  type: 'SKILL',
  category: 'skills',
  name: 'workspace-y-skill',
  description: 'Skill for workspace Y',
  content: 'This skill belongs to workspace Y only.',
  temporalType: 'static',
  scopeSession: 'shared-session',
  scopeAgent: 'shared-agent',
  scopeWorkspace: 'workspace-Y'
}, 'shared-session');

db.prepare("UPDATE bm_nodes SET scope_workspace = ? WHERE id = ?").run('workspace-X', workspaceXNode.id);
db.prepare("UPDATE bm_nodes SET scope_workspace = ? WHERE id = ?").run('workspace-Y', workspaceYNode.id);

console.log(`   创建了Workspace X节点: ${workspaceXNode.name}`);
console.log(`   创建了Workspace Y节点: ${workspaceYNode.name}`);

// 4. 测试作用域匹配功能
console.log('\n✅ 4. 测试作用域匹配功能');

const scopeTests = [
  {
    a: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' },
    b: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' },
    expected: true,
    desc: '完全匹配'
  },
  {
    a: { sessionId: 'session-A', agentId: 'agent-1' },
    b: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' },
    expected: false,  // workspace不匹配
    desc: '部分匹配-缺失字段'
  },
  {
    a: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' },
    b: { sessionId: 'session-B', agentId: 'agent-1', workspaceId: 'workspace-X' },
    expected: false,
    desc: 'Session不匹配'
  },
  {
    a: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' },
    b: { sessionId: 'session-A', agentId: 'agent-2', workspaceId: 'workspace-X' },
    expected: false,
    desc: 'Agent不匹配'
  },
  {
    a: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' },
    b: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-Y' },
    expected: false,
    desc: 'Workspace不匹配'
  }
];

for (const test of scopeTests) {
  const result = scopesMatch(test.a, test.b);
  const passed = result === test.expected;
  console.log(`   ${passed ? '✅' : '❌'} ${test.desc}: ${JSON.stringify(test.a)} vs ${JSON.stringify(test.b)} → ${result} (期望: ${test.expected})`);
}

// 5. 测试作用域键生成功能
console.log('\n✅ 5. 测试作用域键生成功能');

const scopeKeys = [
  { scope: { sessionId: 'session-A', agentId: 'agent-1', workspaceId: 'workspace-X' }, expected: 'session-A|agent-1|workspace-X' },
  { scope: { sessionId: 'session-A', agentId: 'agent-1' }, expected: 'session-A|agent-1|*' },
  { scope: { sessionId: 'session-A' }, expected: 'session-A|*|*' },
  { scope: {}, expected: '*|*|*' }
];

for (const test of scopeKeys) {
  const key = scopeKey(test.scope);
  const passed = key === test.expected;
  console.log(`   ${passed ? '✅' : '❌'} 作用域键生成: ${JSON.stringify(test.scope)} → ${key} (期望: ${test.expected})`);
}

// 6. 测试作用域过滤SQL子句生成功能
console.log('\n✅ 6. 测试作用域过滤SQL子句生成功能');

// 测试包含作用域过滤
const includeFilter = {
  includeScopes: [
    { sessionId: 'session-A', agentId: 'agent-1' }
  ],
  excludeScopes: [],
  allowCrossScope: false
};

const includeClause = buildScopeFilterClause(includeFilter);
console.log(`   包含过滤子句: "${includeClause.clause}", 参数: [${includeClause.params.join(', ')}]`);

// 测试排除作用域过滤
const excludeFilter = {
  includeScopes: [],
  excludeScopes: [
    { sessionId: 'session-B', agentId: 'agent-2' }
  ],
  allowCrossScope: false
};

const excludeClause = buildScopeFilterClause(excludeFilter);
console.log(`   排除过滤子句: "${excludeClause.clause}", 参数: [${excludeClause.params.join(', ')}]`);

// 测试组合过滤
const combinedFilter = {
  includeScopes: [
    { workspaceId: 'workspace-X' }
  ],
  excludeScopes: [
    { agentId: 'agent-3' }
  ],
  allowCrossScope: false
};

const combinedClause = buildScopeFilterClause(combinedFilter);
console.log(`   组合过滤子句: "${combinedClause.clause}", 参数: [${combinedClause.params.join(', ')}]`);

// 7. 测试默认作用域过滤器
console.log('\n✅ 7. 测试默认作用域过滤器');

console.log(`   默认作用域过滤器包含作用域数量: ${DEFAULT_SCOPE_FILTER.includeScopes.length}`);
console.log(`   默认作用域过滤器排除作用域数量: ${DEFAULT_SCOPE_FILTER.excludeScopes.length}`);
console.log(`   允许跨作用域访问: ${DEFAULT_SCOPE_FILTER.allowCrossScope}`);

// 8. 测试作用域过滤的实际效果
console.log('\n✅ 8. 测试作用域过滤的实际效果');

// 获取所有节点
const allNodes = allActiveNodes(db);
console.log(`   所有节点数量: ${allNodes.length}`);

// 使用不同的过滤器进行搜索测试
const searchResults = searchNodes(db, 'skill');
console.log(`   普通搜索结果数量: ${searchResults.length}`);

console.log('\n🎉 多租户隔离测试完成！');