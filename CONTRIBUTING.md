# Contributing to brain-memory

Thank you for your interest in contributing to brain-memory! We welcome contributions from the community to help improve this unified knowledge graph + vector memory system for AI agents.

---

## 环境要求

| 依赖 | 版本 |
|------|------|
| **Node.js** | >= 18.0.0 |
| **TypeScript** | >= 5.0.0 |
| **npm** | 最新版 |

---

## 安装

### 方式一：npm 安装

```bash
npm install memory-likehuman-pro
```

> npm 包仅包含编译后的 `dist/` 目录。如需开发，请使用以下方式。

### 方式二：Git 克隆（开发推荐）

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
```

### 方式三：下载 ZIP

1. 访问 [GitHub 仓库](https://github.com/DylingCreation/brain-memory)
2. 点击 **Code → Download ZIP**
3. 解压后安装依赖

---

## 开发流程

### 创建分支

```bash
# 功能开发
git checkout -b feature/your-feature-name

# 缺陷修复
git checkout -b fix/issue-description
```

### 开发模式

```bash
# 监听模式（文件变更自动重新编译）
npm run dev

# 或直接运行入口
npm run start
```

### 构建

```bash
# 清理 + 编译主代码
npm run build

# 编译 OpenClaw 插件
npm run build:plugin

# 全部构建（清理 + 主代码 + 插件）
npm run build:all
```

---

## 代码风格

### TypeScript 规范

- 所有源代码使用 TypeScript
- 遵循现有代码风格和命名约定
- 变量和函数名使用描述性名称
- 导出的函数和类添加 JSDoc 注释

### 文件组织

- 源代码放在 `src/` 目录
- 按功能模块组织子目录（如 `src/extractor/`、`src/recaller/`）
- 相关文件放在一起（类型定义、工具函数、主实现）
- 通过 `index.ts` 导出简化 import

### 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 类名 / 接口 | `PascalCase` | `ContextEngine`、`BmConfig` |
| 函数 / 变量 / 方法 | `camelCase` | `processTurn`、`recallResult` |
| 常量 | `UPPER_SNAKE_CASE` | `DEFAULT_CONFIG`、`MEMORY_CATEGORIES` |

### 配置文件

项目包含多个 TypeScript 配置文件：

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 主开发配置 |
| `tsconfig.build.json` | 构建配置 |
| `tsconfig.plugin.json` | OpenClaw 插件构建配置 |
| `tsconfig.test.json` | 测试配置 |

---

## 测试

### 运行测试

```bash
# 运行所有测试（vitest watch 模式）
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行性能测试
npm run test:performance

# 运行端到端测试
npm run test:e2e

# CI 模式（无交互，junit + verbose 输出）
npm run test:ci
```

### 测试目录结构

```
test/                    # 测试文件（主目录，vitest 默认扫描）
├── *.test.ts            # 各模块单元测试（30+ 文件）
├── helpers.ts           # 测试辅助函数
├── integration.test.ts  # 集成测试
└── ...

tests/                   # 额外测试分类
├── unit/                # 单元测试（旧格式）
├── integration/         # 集成测试（旧格式）
├── e2e/                 # 端到端测试
├── performance/         # 性能测试
├── test_data/           # 测试数据文件
└── setup.ts             # 测试环境配置
```

### 编写测试

- 为新函数和类编写单元测试
- 为新功能添加集成测试
- 使用描述性测试名称说明预期行为
- 遵循 AAA 模式（Arrange / Act / Assert）
- 测试边界条件和错误处理

---

## 文档

### 源代码文档

- 所有导出的函数、类和接口添加 JSDoc 注释
- 文档参数、返回值和潜在错误
- 必要时提供使用示例

### 外部文档

更新 `docs/` 目录中的相关文档：

| 文档 | 内容 |
|------|------|
| `docs/overview.md` | 项目概述 |
| `docs/architecture.md` | 架构设计 |
| `docs/api.md` | API 快速参考 |
| `docs/api-reference.md` | API 详细参考 |
| `docs/usage.md` | 使用指南 |
| `docs/user-guide.md` | 用户指南 |
| `docs/deployment.md` | 部署指南 |
| `docs/security.md` | 安全指南 |

---

## Pull Request 流程

1. 确保代码遵循代码风格指南
2. 根据需要更新文档
3. 为新功能添加测试
4. 运行所有测试并确保通过：`npm test`
5. 提交 Pull Request 到 `main` 分支
6. 在 PR 描述中填写：
   - 变更描述
   - 相关 Issue（如有）
   - 测试执行情况

### PR 要求

- ✅ 所有测试必须通过
- ✅ 变更应有充分的文档说明
- ✅ 破坏性变更需要明确解释

---

## Issues

### 创建 Issue

创建 Issue 时，请：

- 使用清晰的标题
- 详细描述问题
- 提供复现步骤（Bug 类）
- 说明期望的行为与实际行为
- 添加相关标签（bug / enhancement 等）

### 提交安全问题

如果发现问题涉及安全（如 API Key 泄露、注入漏洞等），请通过 [GitHub Issues](https://github.com/DylingCreation/brain-memory/issues) 提交。

---

## CI / CD

项目使用 GitHub Actions 进行持续集成。

**配置文件：** [`.github/workflows/test.yml`](.github/workflows/test.yml)

每次提交和 PR 都会自动运行测试。

---

## 有问题？

- 在 [GitHub Issues](https://github.com/DylingCreation/brain-memory/issues) 中提问或讨论
- 查阅 `docs/` 目录中的文档
- 参考现有代码了解编码模式和最佳实践

---

Thank you for contributing to brain-memory! 🧠
