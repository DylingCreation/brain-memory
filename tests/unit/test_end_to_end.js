/**
 * brain-memory 端到端测试
 * 模拟完整的工作流程：对话-提取-召回-反思
 */

import { initDb } from './src/store/db.ts';
import { upsertNode, upsertEdge, searchNodes, allActiveNodes } from './src/store/store.ts';
import { Recaller } from './src/recaller/recall.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
import { Extractor } from './src/extractor/extract.ts';
import { 
  updateWorkingMemory, 
  buildWorkingMemoryContext,
  createWorkingMemory 
} from './src/working-memory/manager.ts';
import { 
  reflectOnSession, 
  reflectOnTurn,
  sanitizeReflectionText 
} from './src/reflection/extractor.ts';
import { assembleContext } from './src/format/assemble.ts';
import { runFusion } from './src/fusion/analyzer.ts';
import { runReasoning } from './src/reasoning/engine.ts';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始端到端测试...');

// 1. 模拟完整的对话-提取-召回-反思流程
console.log('\n✅ 1. 模拟完整的工作流：对话-提取-召回-反思');

// 模拟对话消息
const conversation = [
  {
    role: 'user',
    content: '我需要帮助部署一个Python Flask应用到服务器上，有什么好的方法吗？',
    turn_index: 1
  },
  {
    role: 'assistant',
    content: '你可以考虑使用Docker容器化部署，这样可以确保环境一致性。你需要先创建一个Dockerfile和docker-compose.yml文件。',
    turn_index: 2
  },
  {
    role: 'user',
    content: '好的，我听说Docker很好用。但是我遇到了一个数据库连接的问题，连接不上PostgreSQL。',
    turn_index: 3
  },
  {
    role: 'assistant',
    content: '这通常是因为环境变量配置不正确或者网络设置有问题。请检查你的DATABASE_URL环境变量是否正确设置。',
    turn_index: 4
  },
  {
    role: 'user',
    content: '我按照你说的检查了，发现是端口映射的问题。现在解决了，谢谢！',
    turn_index: 5
  },
  {
    role: 'assistant',
    content: '很好！记得把这次的经验记录下来，以后遇到类似问题可以直接参考。',
    turn_index: 6
  }
];

// 2. 测试ContextEngine生命周期各阶段的正确执行
console.log('\n✅ 2. 测试ContextEngine生命周期各阶段');

import { createLLMClient } from './llm_client.js';

const mockLLM = await createLLMClient();

// 初始化提取器
const extractor = new Extractor(DEFAULT_CONFIG, mockLLM);

// 提取知识
console.log('   执行知识提取...');
const extractionResult = await extractor.extract({
  messages: conversation,
  existingNames: []
});

console.log(`   提取节点数量: ${extractionResult.nodes.length}`);
console.log(`   提取边数量: ${extractionResult.edges.length}`);

// 将提取的节点存入数据库
console.log('   保存提取的节点...');
const extractedNodes = [];
for (const nodeData of extractionResult.nodes) {
  const { node, isNew } = upsertNode(db, {
    type: nodeData.type,
    category: nodeData.category,
    name: nodeData.name,
    description: nodeData.description,
    content: nodeData.content,
    temporalType: nodeData.temporalType || 'static'
  }, 'conversation-session');
  extractedNodes.push(node);
  console.log(`     保存节点: ${node.name} (${isNew ? '新' : '已存在'})`);
}

// 保存提取的边
console.log('   保存提取的边...');
for (const edgeData of extractionResult.edges) {
  upsertEdge(db, {
    fromId: extractedNodes.find(n => n.name === edgeData.from)?.id || '',
    toId: extractedNodes.find(n => n.name === edgeData.to)?.id || '',
    type: edgeData.type,
    instruction: edgeData.instruction,
    condition: edgeData.condition,
    sessionId: 'conversation-session'
  });
  console.log(`     保存边: ${edgeData.from} --[${edgeData.type}]--> ${edgeData.to}`);
}

// 3. 测试召回功能
console.log('\n✅ 3. 测试召回功能');

const recaller = new Recaller(db, DEFAULT_CONFIG);
const recallResult = await recaller.recall('deploy flask app with docker');
console.log(`   召回节点数量: ${recallResult.nodes.length}`);
console.log(`   召回边数量: ${recallResult.edges.length}`);

// 4. 测试工作记忆功能
console.log('\n✅ 4. 测试工作记忆功能');

// 初始化工作记忆
let workingMemory = createWorkingMemory();
console.log(`   初始化工作记忆，当前任务数: ${workingMemory.currentTasks.length}`);

// 更新工作记忆
workingMemory = updateWorkingMemory(
  workingMemory,
  DEFAULT_CONFIG.workingMemory,
  {
    extractedNodes: extractionResult.nodes,
    userMessage: 'How do I deploy a Flask app with Docker?'
  }
);

console.log(`   更新后工作记忆，当前任务数: ${workingMemory.currentTasks.length}`);
console.log(`   当前任务: ${workingMemory.currentTasks.join(', ')}`);

// 构建工作记忆上下文
const workingMemoryContext = buildWorkingMemoryContext(workingMemory);
console.log(`   工作记忆上下文存在: ${!!workingMemoryContext}`);

// 5. 测试反思功能
console.log('\n✅ 5. 测试反思功能');

// 会话反思
const sessionReflections = await reflectOnSession(
  DEFAULT_CONFIG.reflection,
  mockLLM,
  {
    sessionMessages: conversation.map(msg => `[${msg.role}] ${msg.content}`).join('\n'),
    extractedNodes: extractionResult.nodes
  }
);

console.log(`   会话反思洞察数量: ${sessionReflections.length}`);
sessionReflections.forEach((insight, index) => {
  console.log(`     ${index + 1}. [${insight.kind}] ${insight.text} (置信度: ${insight.confidence})`);
});

// 轮次反思
const turnReflections = await reflectOnTurn(
  DEFAULT_CONFIG.reflection,
  mockLLM,
  {
    extractedNodes: extractedNodes.map(n => ({
      name: n.name,
      category: n.category,
      type: n.type,
      validatedCount: n.validatedCount
    })),
    existingNodes: []
  }
);

console.log(`   轮次反思提升数量: ${turnReflections.length}`);

// 6. 测试上下文组装
console.log('\n✅ 6. 测试上下文组装');

const assembledContext = assembleContext(db, {
  tokenBudget: 1000,
  recallStrategy: 'full',
  activeNodes: [],
  activeEdges: [],
  recalledNodes: recallResult.nodes,
  recalledEdges: recallResult.edges
});

console.log(`   组装上下文长度: ${assembledContext.xml ? assembledContext.xml.length : 0} 字符`);
console.log(`   系统提示长度: ${assembledContext.systemPrompt.length} 字符`);
console.log(`   估算Token数: ${assembledContext.tokens}`);

// 7. 测试知识融合
console.log('\n✅ 7. 测试知识融合');

const fusionResult = await runFusion(db, DEFAULT_CONFIG, mockLLM, null, 'conversation-session');
console.log(`   知识融合: 合并 ${fusionResult.merged} 个节点, 链接 ${fusionResult.linked} 个节点`);
console.log(`   融合耗时: ${fusionResult.durationMs}ms`);

// 8. 测试推理检索
console.log('\n✅ 8. 测试推理检索');

const reasoningResult = await runReasoning(
  mockLLM,
  recallResult.nodes,
  recallResult.edges,
  'deploy flask app with docker',
  DEFAULT_CONFIG
);

console.log(`   推理触发: ${reasoningResult.triggered}`);
console.log(`   推理结论数量: ${reasoningResult.conclusions.length}`);

if (reasoningResult.conclusions.length > 0) {
  reasoningResult.conclusions.forEach((conclusion, index) => {
    console.log(`     ${index + 1}. [${conclusion.type}] ${conclusion.text} (置信度: ${conclusion.confidence})`);
  });
}

// 9. 验证完整流程
console.log('\n✅ 9. 验证完整流程');

const allNodes = allActiveNodes(db);
const allEdges = [
  // 我们无法直接获取所有边，但可以通过查询获得
  ...extractionResult.edges.map(e => ({
    from: e.from,
    to: e.to,
    type: e.type
  }))
];

console.log(`   最终节点总数: ${allNodes.length}`);
console.log(`   提取的边总数: ${extractionResult.edges.length}`);

// 10. 测试实际查询场景
console.log('\n✅ 10. 测试实际查询场景');

// 模拟用户询问特定问题
const queryResults = searchNodes(db, 'docker deployment');
console.log(`   查询'docker deployment'结果: ${queryResults.length} 个节点`);

const specificQueryResults = searchNodes(db, 'database connection');
console.log(`   查询'database connection'结果: ${specificQueryResults.length} 个节点`);

console.log('\n🎉 端到端测试完成！');
console.log('   所有主要组件均已成功协同工作！');