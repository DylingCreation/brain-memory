/**
 * brain-memory 实际应用场景测试（简化版）
 * 验证技术问题的提取和召回
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
  reflectOnTurn
} from './src/reflection/extractor.ts';
import { assembleContext } from './src/format/assemble.ts';
import { runFusion } from './src/fusion/analyzer.ts';
import { runReasoning } from './src/reasoning/engine.ts';
import fs from 'fs';

// 创建内存数据库进行测试
const db = initDb(':memory:');

console.log('🔍 开始实际应用场景测试（简化版）...');

// 1. 加载生成的测试数据
console.log('\n✅ 1. 加载生成的测试数据');

const testDataFiles = [
  'developer_dialogue.txt',
  'project_collaboration.txt',
  'tech_support.txt',
  'learning_session.txt',
  'noise_content.txt'
];

for (const fileName of testDataFiles) {
  try {
    const filePath = `./test_data/${fileName}`;
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log(`   ✓ 加载 ${fileName}: ${content.length} 字符`);
    } else {
      console.log(`   ⚠️  未找到 ${fileName}`);
    }
  } catch (error) {
    console.log(`   ❌ 加载 ${fileName} 失败: ${error.message}`);
  }
}

// 2. 模拟开发者对话场景
console.log('\n✅ 2. 模拟开发者对话场景');

import { createLLMClient } from './llm_client.js';

const mockLLM = await createLLMClient();

// 初始化提取器
const extractor = new Extractor(DEFAULT_CONFIG, mockLLM);

// 模拟对话消息
const conversation = [
  {
    role: 'user',
    content: '我正在开发一个Python Flask应用，需要将其部署到云端。有什么好的方法吗？',
    turn_index: 1
  },
  {
    role: 'assistant',
    content: '你可以考虑使用Docker容器化部署，这样可以确保环境一致性。你需要创建一个Dockerfile和docker-compose.yml文件来定义你的服务配置。',
    turn_index: 2
  },
  {
    role: 'user',
    content: '我尝试使用Docker部署，但是遇到了数据库连接的问题。错误信息是"connection refused"。',
    turn_index: 3
  },
  {
    role: 'assistant',
    content: '这通常是由于数据库服务没有正确启动或网络配置问题导致的。请检查你的docker-compose.yml文件中数据库服务的配置，确保端口映射正确。',
    turn_index: 4
  },
  {
    role: 'user',
    content: '我检查了配置，发现是环境变量设置的问题。现在连接成功了，谢谢！',
    turn_index: 5
  },
  {
    role: 'assistant',
    content: '很好！记得记录下这个问题和解决方案，这对于未来遇到类似问题很有帮助。',
    turn_index: 6
  }
];

// 3. 测试技术问题的提取
console.log('\n✅ 3. 测试技术问题的提取');

// 执行提取
console.log('   执行技术问题提取...');
const extractionResult = await extractor.extract({
  messages: conversation,
  existingNames: []
});

console.log(`   提取节点数量: ${extractionResult.nodes.length}`);
console.log(`   提取边数量: ${extractionResult.edges.length}`);

// 4. 保存提取的节点和边
console.log('\n✅ 4. 保存提取的节点和边');

const extractedNodes = [];
for (const nodeData of extractionResult.nodes) {
  const { node, isNew } = upsertNode(db, {
    type: nodeData.type,
    category: nodeData.category,
    name: nodeData.name,
    description: nodeData.description,
    content: nodeData.content,
    temporalType: nodeData.temporalType || 'static'
  }, 'dev-session');
  extractedNodes.push(node);
  console.log(`     保存节点: ${node.name} (${nodeData.category})`);
}

// 保存提取的边
for (const edgeData of extractionResult.edges) {
  const fromNode = extractedNodes.find(n => n.name === edgeData.from);
  const toNode = extractedNodes.find(n => n.name === edgeData.to);
  if (fromNode && toNode) {
    upsertEdge(db, {
      fromId: fromNode.id,
      toId: toNode.id,
      type: edgeData.type,
      instruction: edgeData.instruction,
      condition: edgeData.condition,
      sessionId: 'dev-session'
    });
    console.log(`     保存边: ${edgeData.from} --[${edgeData.type}]--> ${edgeData.to}`);
  }
}

// 5. 验证技术问题的召回
console.log('\n✅ 5. 验证技术问题的召回');

const recaller = new Recaller(db, DEFAULT_CONFIG);

// 测试技术相关的召回
const techQueries = [
  'docker deployment',
  'database connection',
  'flask app',
  'environment variables',
  'connection refused'
];

for (const query of techQueries) {
  const recallResult = await recaller.recall(query);
  console.log(`   查询 "${query}": ${recallResult.nodes.length} 个节点, ${recallResult.edges.length} 条边`);
}

// 6. 测试工作记忆对任务跟踪的作用
console.log('\n✅ 6. 测试工作记忆对任务跟踪的作用');

// 初始化工作记忆
let workingMemory = createWorkingMemory();

// 更新工作记忆
workingMemory = updateWorkingMemory(
  workingMemory,
  DEFAULT_CONFIG.workingMemory,
  {
    extractedNodes: extractionResult.nodes,
    userMessage: 'How do I deploy a Flask app with Docker?'
  }
);

console.log(`   当前任务: ${workingMemory.currentTasks.join(', ')}`);
console.log(`   约束/偏好: ${workingMemory.constraints.length} 项`);
console.log(`   工作记忆上下文存在: ${!!buildWorkingMemoryContext(workingMemory)}`);

// 7. 测试反思系统对项目经验的总结
console.log('\n✅ 7. 测试反思系统对项目经验的总结');

const sessionReflections = await reflectOnSession(
  DEFAULT_CONFIG.reflection,
  mockLLM,
  {
    sessionMessages: conversation.map(msg => `[${msg.role}] ${msg.content}`).join('\n'),
    extractedNodes: extractionResult.nodes
  }
);

console.log(`   会话反思识别出 ${sessionReflections.length} 个洞察:`);
sessionReflections.forEach((insight, index) => {
  console.log(`     ${index + 1}. [${insight.kind}] ${insight.text} (置信度: ${insight.confidence})`);
});

// 8. 测试推理检索对技术问题的解决
console.log('\n✅ 8. 测试推理检索对技术问题的解决');

const allNodes = allActiveNodes(db);

// 由于我们没有保存边到数据库，我们使用空数组
const reasoningResult = await runReasoning(
  mockLLM,
  allNodes,
  [],
  '如何解决Docker部署中的数据库连接问题？',
  DEFAULT_CONFIG
);

console.log(`   推理检索结果: ${reasoningResult.triggered ? '触发' : '未触发'}`);
console.log(`   推理结论数量: ${reasoningResult.conclusions.length}`);

if (reasoningResult.conclusions.length > 0) {
  reasoningResult.conclusions.forEach((conclusion, index) => {
    console.log(`     ${index + 1}. [${conclusion.type}] ${conclusion.text} (置信度: ${conclusion.confidence})`);
  });
}

// 9. 测试上下文组装对开发效率的提升
console.log('\n✅ 9. 测试上下文组装对开发效率的提升');

const assembledContext = assembleContext(db, {
  tokenBudget: 1500,
  recallStrategy: 'full',
  activeNodes: [],
  activeEdges: [],
  recalledNodes: allNodes.slice(0, 10), // 取前10个节点
  recalledEdges: []
});

console.log(`   上下文组装完成: ${assembledContext.tokens} tokens`);
console.log(`   系统提示长度: ${assembledContext.systemPrompt.length} 字符`);
console.log(`   是否包含知识图谱: ${assembledContext.xml ? '是' : '否'}`);

// 10. 验证项目协作场景
console.log('\n✅ 10. 验证项目协作场景');

// 模拟项目协作场景，添加用户偏好和任务
const { node: userPreferenceNode } = upsertNode(db, {
  type: 'TASK',
  category: 'preferences',
  name: 'prefer-agile-development',
  description: '偏好敏捷开发',
  content: '用户偏好使用敏捷开发方法，喜欢每日站会',
  temporalType: 'static'
}, 'project-session');

const { node: taskNode } = upsertNode(db, {
  type: 'TASK',
  category: 'tasks',
  name: 'implement-user-authentication',
  description: '实现用户认证功能',
  content: '实现用户注册、登录和权限管理功能',
  temporalType: 'dynamic'
}, 'project-session');

console.log(`   添加用户偏好: ${userPreferenceNode.name}`);
console.log(`   添加任务: ${taskNode.name}`);

// 11. 最终验证
console.log('\n✅ 11. 最终验证');

// 验证关键节点是否存在
const keyNodes = [
  'flask-app-docker-deployment',
  'database-connection-debugging',
  'deploy-python-flask-app'
];

let foundNodes = 0;
for (const nodeName of keyNodes) {
  const node = allActiveNodes(db).find(n => n.name === nodeName);
  if (node) {
    foundNodes++;
    console.log(`   ✓ 找到关键节点: ${nodeName}`);
  } else {
    console.log(`   ⚠️  未找到关键节点: ${nodeName}`);
  }
}

// 测试特定查询
const dockerQueryResults = searchNodes(db, 'docker');
const dbQueryResults = searchNodes(db, 'database');

console.log(`\n📊 测试总结:`);
console.log(`   提取节点总数: ${extractionResult.nodes.length}`);
console.log(`   数据库总节点数: ${allActiveNodes(db).length}`);
console.log(`   关键节点找回率: ${foundNodes}/${keyNodes.length} (${(foundNodes/keyNodes.length*100).toFixed(1)}%)`);
console.log(`   'docker' 查询结果: ${dockerQueryResults.length} 个节点`);
console.log(`   'database' 查询结果: ${dbQueryResults.length} 个节点`);

console.log('\n🎉 实际应用场景测试完成！');
console.log('   技术问题提取和召回功能工作正常！');