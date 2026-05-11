/**
 * brain-memory 配置模板
 * 请复制此文件为 config.js 并填入您的实际配置
 * 此文件不应包含任何敏感信息（生产环境建议使用 .env 或密钥管理）
 */

export const LLM_CONFIG = {
  // 替换为您的实际 API 基础 URL
  baseURL: 'YOUR_LLM_BASE_URL_HERE',
  // 替换为您的实际 API 密钥
  apiKey: 'YOUR_API_KEY_HERE',
  // 替换为您的实际模型名称
  model: 'YOUR_MODEL_NAME_HERE'
};

export const EMBEDDING_CONFIG = {
  // 替换为您的实际嵌入模型名称
  model: 'YOUR_EMBEDDING_MODEL_HERE',
  // 替换为您的实际嵌入服务基础 URL
  baseURL: 'YOUR_EMBEDDING_BASE_URL_HERE'
};
