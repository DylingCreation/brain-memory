/**
 * brain-memory 工作记忆测试
 * 验证工作记忆状态的创建和更新，以及从提取结果中更新工作记忆
 */

import { createWorkingMemory, updateWorkingMemory, buildWorkingMemoryContext } from './src/working-memory/manager.ts';
import { DEFAULT_CONFIG } from './src/types.ts';

console.log('🔍 开始工作记忆测试...');

// 1. 测试工作记忆状态的创建
console.log('\n✅ 1. 测试工作记忆状态的创建');

const initialWorkingMemory = createWorkingMemory();
console.log(`   初始任务列表长度: ${initialWorkingMemory.currentTasks.length}`);
console.log(`   初始决策列表长度: ${initialWorkingMemory.recentDecisions.length}`);
console.log(`   初始约束列表长度: ${initialWorkingMemory.constraints.length}`);
console.log(`   当前关注点: "${initialWorkingMemory.attention}"`);
console.log(`   更新时间戳: ${initialWorkingMemory.updatedAt}`);

// 2. 测试从提取结果中更新工作记忆
console.log('\n✅ 2. 测试从提取结果中更新工作记忆');

let workingMemory = { ...initialWorkingMemory };

// 模拟第一次提取结果
const firstExtraction = {
  extractedNodes: [
    {
      name: 'setup-docker-container',
      category: 'skills',
      type: 'SKILL',
      content: 'Using docker-compose to set up containers'
    },
    {
      name: 'user-preference-for-python',
      category: 'preferences',
      type: 'TASK',
      content: 'User prefers Python for backend development'
    }
  ],
  userMessage: 'Can you help me set up a Docker container for my Python Flask app?'
};

workingMemory = updateWorkingMemory(
  workingMemory,
  DEFAULT_CONFIG.workingMemory,
  firstExtraction
);

console.log(`   更新后的任务列表: ${workingMemory.currentTasks.join(', ')}`);
console.log(`   更新后的决策列表: ${workingMemory.recentDecisions.join(', ')}`);
console.log(`   更新后的约束列表: ${workingMemory.constraints.join(', ')}`);
console.log(`   更新后的关注点: "${workingMemory.attention}"`);

// 模拟第二次提取结果
const secondExtraction = {
  extractedNodes: [
    {
      name: 'fix-database-connection-error',
      category: 'events',
      type: 'EVENT',
      content: 'Resolved database connection issue by checking environment variables'
    },
    {
      name: 'user-dislikes-verbose-logs',
      category: 'preferences',
      type: 'TASK',
      content: 'User prefers minimal logging output'
    }
  ],
  userMessage: 'I\'m getting a database connection error when I try to run the container.'
};

workingMemory = updateWorkingMemory(
  workingMemory,
  DEFAULT_CONFIG.workingMemory,
  secondExtraction
);

console.log(`   再次更新后的任务列表: ${workingMemory.currentTasks.join(', ')}`);
console.log(`   再次更新后的决策列表: ${workingMemory.recentDecisions.join(', ')}`);
console.log(`   再次更新后的约束列表: ${workingMemory.constraints.map(c => c.substring(0, 30) + '...').join(', ')}`);
console.log(`   再次更新后的关注点: "${workingMemory.attention}"`);

// 3. 测试工作记忆内容的上下文注入
console.log('\n✅ 3. 测试工作记忆内容的上下文注入');

const contextString = buildWorkingMemoryContext(workingMemory);
console.log('   构建的工作记忆上下文:');
console.log(contextString ? `   ${contextString.replace(/\n/g, '\n   ')}` : '   (无内容)');

// 4. 测试工作记忆配置限制
console.log('\n✅ 4. 测试工作记忆配置限制');

// 创建一个具有较小限制的配置
const limitedConfig = {
  ...DEFAULT_CONFIG.workingMemory,
  maxTasks: 2,
  maxDecisions: 3,
  maxConstraints: 2
};

let limitedWorkingMemory = createWorkingMemory();

// 添加超过限制的节点
const manyExtractions = {
  extractedNodes: [
    { name: 'task-one', category: 'tasks', type: 'TASK', content: 'First task' },
    { name: 'task-two', category: 'tasks', type: 'TASK', content: 'Second task' },
    { name: 'task-three', category: 'tasks', type: 'TASK', content: 'Third task' },
    { name: 'decision-one', category: 'events', type: 'EVENT', content: 'First decision' },
    { name: 'decision-two', category: 'events', type: 'EVENT', content: 'Second decision' },
    { name: 'decision-three', category: 'events', type: 'EVENT', content: 'Third decision' },
    { name: 'decision-four', category: 'events', type: 'EVENT', content: 'Fourth decision' },
    { name: 'constraint-one', category: 'preferences', type: 'TASK', content: 'First constraint' },
    { name: 'constraint-two', category: 'preferences', type: 'TASK', content: 'Second constraint' },
    { name: 'constraint-three', category: 'preferences', type: 'TASK', content: 'Third constraint' }
  ],
  userMessage: 'Testing memory limits'
};

limitedWorkingMemory = updateWorkingMemory(
  limitedWorkingMemory,
  limitedConfig,
  manyExtractions
);

console.log(`   任务数量限制测试: ${limitedWorkingMemory.currentTasks.length}/${limitedConfig.maxTasks} (期望不超过${limitedConfig.maxTasks})`);
console.log(`   决策数量限制测试: ${limitedWorkingMemory.recentDecisions.length}/${limitedConfig.maxDecisions} (期望不超过${limitedConfig.maxDecisions})`);
console.log(`   约束数量限制测试: ${limitedWorkingMemory.constraints.length}/${limitedConfig.maxConstraints} (期望不超过${limitedConfig.maxConstraints})`);

console.log('\n🎉 工作记忆测试完成！');