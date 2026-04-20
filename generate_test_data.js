/**
 * 生成测试数据的脚本
 * 使用LLM生成多样化的对话和记忆内容数据
 */

import fs from 'fs';
import path from 'path';

async function callQwen3(apiKey, prompt) {
  // 从环境变量获取基础URL，默认为占位符
  const baseUrl = process.env.DASHSCOPE_BASE_URL || 'YOUR_DASHSCOPE_BASE_URL';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen3.6-plus',
      messages: [{ role: 'user', content: prompt }],
      "enable_thinking":true,
      "thinking_budget": 50,
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateTestData() {
  // 从环境变量或配置文件获取API密钥
  const apiKey = process.env.DASHSCOPE_API_KEY || 'YOUR_API_KEY_HERE';
  
  console.log('正在生成测试数据...');
  
  // 生成多样化的对话场景
  const prompts = [
    {
      name: 'developer_dialogue',
      prompt: `生成一段开发者与AI助手关于Python Flask应用开发的对话，包含以下要素：
      1. 讨论Flask应用的架构设计
      2. 遇到Docker容器部署问题及解决方案
      3. 数据库迁移过程中的踩坑经验
      4. 用户偏好（如代码风格、工具选择）
      5. 一些简短的确认性回复（如"好的"、"明白了"）
      6. 一些问候语（如"你好"、"早上好"）
      对话至少包含20轮交互。`
    },
    {
      name: 'project_collaboration',
      prompt: `生成一段项目协作对话，包含以下要素：
      1. 项目需求讨论
      2. 技术选型决策（如选择SQLite还是PostgreSQL）
      3. 团队成员偏好（如喜欢敏捷开发、每日站会）
      4. 项目里程碑和任务分配
      5. 项目中遇到的问题和解决方案
      6. 一些日常寒暄和感谢`
    },
    {
      name: 'tech_support',
      prompt: `生成一段技术支持对话，包含以下要素：
      1. 用户遇到的技术问题（如API错误、性能问题）
      2. 详细的排查过程
      3. 最终的解决方案
      4. 用户的技术偏好和使用习惯
      5. 一些无效的交流（如"谢谢"、"知道了"）
      6. 错误信息的具体描述`
    },
    {
      name: 'learning_session',
      prompt: `生成一段学习辅导对话，包含以下要素：
      1. 学习者的背景和目标
      2. 概念解释和示例
      3. 实践练习和反馈
      4. 学习者的偏好和困难点
      5. 学习经验和教训
      6. 一些简单的确认回复`
    },
    {
      name: 'noise_content',
      prompt: `生成一些典型的噪声内容，包括：
      1. 简短的问候语（如"你好"、"Hi"、"Hello"）
      2. 简短的确认回复（如"好的"、"知道了"、"OK"、"Yes"、"No"）
      3. 感谢语（如"谢谢"、"Thanks"、"Thank you"）
      4. 表情符号（如"👍"、"👌"、"✅"、"❤️"）
      5. 无意义的短语（如"嗯嗯"、"哈哈"、"呵呵"）`
    }
  ];

  const testDataDir = './test_data';
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  // 确保在正确的项目目录下运行
  const projectRoot = path.resolve('./');
  if (!fs.existsSync(path.join(projectRoot, 'src'))) {
    console.error('错误: 请在 brain-memory 项目根目录下运行此脚本');
    process.exit(1);
  }
  console.log(`在项目目录: ${projectRoot} 中生成测试数据`);

  for (const { name, prompt } of prompts) {
    try {
      console.log(`正在生成 ${name} 数据...`);
      const content = await callQwen3(apiKey, prompt);
      
      // 保存生成的数据
      const filePath = path.join(testDataDir, `${name}.txt`);
      fs.writeFileSync(filePath, content);
      
      console.log(`✓ ${name} 数据已保存至 ${filePath}`);
    } catch (error) {
      console.error(`✗ 生成 ${name} 数据时出错:`, error.message);
    }
  }

  console.log('\n测试数据生成完成！');
}

// 运行生成函数
generateTestData().catch(console.error);