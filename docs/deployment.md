# Deployment Guide

> 面向运维人员的部署操作文档。

---

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| **Node.js** | >= 18.0.0 | 来自 `package.json` 的 `engines` 字段 |
| **npm** | 最新版 | 包管理器 |
| **SQLite3** | 内置 | 通过 `@photostructure/sqlite` 内置，无需额外安装 |

---

## 安装

### 方式一：npm 安装

```bash
npm install memory-likehuman-pro
```

> npm 包仅包含编译后的 `dist/` 目录。

### 方式二：Git 克隆（含源码和配置脚本）

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

## 构建

```bash
# 清理 + 编译主代码
npm run build

# 编译 OpenClaw 插件
npm run build:plugin

# 全部构建（清理 + 主代码 + 插件）
npm run build:all
```

构建产物输出到 `dist/` 目录。

---

## 配置

### OpenClaw 集成（主场景）

brain-memory 设计为 OpenClaw 插件使用。运行交互式配置向导：

```bash
node scripts/setup.js
```

脚本会自动将配置写入 `~/.openclaw/openclaw.json`。

或手动在 `~/.openclaw/openclaw.json` 中添加：

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "llm": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://your-ll-api-endpoint/v1",
            "model": "your-model-name"
          },
          "embedding": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://your-embedding-api-endpoint/v1",
            "model": "your-embedding-model"
          }
        }
      }
    }
  }
}
```

### 独立库使用

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

const config = {
  ...DEFAULT_CONFIG,
  dbPath: './brain-memory.db',
  llm: {
    apiKey: 'your-api-key-here',
    baseURL: 'https://your-ll-api-endpoint/v1',
    model: 'your-model-name'
  },
  embedding: {
    apiKey: 'your-api-key-here',
    baseURL: 'https://your-embedding-api-endpoint/v1',
    model: 'your-embedding-model'
  }
};

const engine = new ContextEngine(config);
```

---

## 数据库

### 默认路径

| 场景 | 默认路径 |
|------|---------|
| OpenClaw 插件 | `~/.openclaw/brain-memory.db` |
| 独立库使用 | 需在配置中指定 `dbPath` |

### 自定义路径

在配置中修改 `dbPath` 字段：

```json
{
  "brain-memory": {
    "config": {
      "dbPath": "/data/brain-memory.db"
    }
  }
}
```

支持 `~` 路径展开（自动替换为 HOME 目录）。

### 数据库特性

| 特性 | 说明 |
|------|------|
| **WAL 模式** | 已启用（`PRAGMA journal_mode=WAL`），支持并发读写 |
| **外键约束** | 已启用（`PRAGMA foreign_keys=ON`） |
| **FTS5 索引** | 自动同步（通过触发器） |
| **6 张表 + 8 个索引** | 完整的图存储 + 向量存储 + 全文检索 |

### 数据库迁移（v0.2.0 新增）

v0.2.0 引入了数据库迁移系统，确保从旧版本平滑升级：

- **`bm_meta` 表** — 存储 schema 版本号（新增表，不修改任何现有表）
- **自动迁移** — `initDb()` 每次调用后自动执行 `migrate()`，幂等操作
- **升级路径** — 用户从 v0.1.x 升级到 v0.2.0 时，旧 DB 文件会被自动标记为 schema v1，无需手动操作
- **增量迁移** — 预留了 `migrateTo_v2` 等扩展模板，后续 schema 变更将支持逐步升级

### 备份

直接复制 SQLite 数据库文件即可：

```bash
# 完整备份
cp ~/.openclaw/brain-memory.db /backup/brain-memory-$(date +%Y%m%d).db

# 压缩备份
gzip /backup/brain-memory-$(date +%Y%m%d).db
```

> WAL 模式下建议同时备份 `-wal` 和 `-shm` 文件（如果存在）。

---

## 日志（v0.2.0 更新）

### 结构化日志

v0.2.0 引入了结构化日志系统，使用 `BM_LOG_LEVEL` 环境变量控制：

| BM_LOG_LEVEL | 可见级别 | 说明 |
|-------------|---------|------|
| `error` | 仅 ERROR | 生产环境，仅看错误 |
| `warn` | ERROR + WARN | 日常运行，关注警告 |
| `info`（默认） | ERROR + WARN + INFO | 基本信息 |
| `debug` | 全部 | 调试模式，包含所有调试信息 |

```bash
BM_LOG_LEVEL=info node your-app.js
BM_LOG_LEVEL=debug node your-app.js  # 调试模式
```

**输出格式：**
```
[brain-memory][2026-04-29 11:45:23.456][INFO ][context] Initialized with 42 existing nodes
```

### LLM 请求日志（兼容旧机制）

```bash
BM_LOG_LLM=1 node your-app.js  # LLM 请求/响应/重试日志
```

### 废弃说明

`BM_DEBUG` 环境变量已废弃，请使用 `BM_LOG_LEVEL=debug` 替代。

### 正常启动日志

brain-memory 启动时会输出以下信息：

```
[brain-memory] Registering plugin with OpenClaw
[brain-memory] Plugin initialized successfully
[brain-memory] ContextEngine initialized with N existing nodes
```

| 日志信息 | 含义 |
|---------|------|
| `Plugin initialized successfully` | 插件初始化成功 |
| `ContextEngine initialized with N existing nodes` | 加载已有 N 个记忆节点 |
| `LLM not configured — ...` | 未配置 LLM，LLM 依赖功能将优雅降级跳过 |
| `Plugin disabled by configuration` | 插件被配置禁用 |

### 运行时日志

| 日志信息 | 含义 |
|---------|------|
| `Extracted N nodes, M edges` | 本轮提取结果 |
| `Cached N memories for agent X` | 记忆缓存更新 |
| `Recall for "...": N nodes` | 召回结果数量 |
| `Session started: X` / `Session ended: X` | 会话生命周期 |
| `Maintenance completed` | 图维护完成 |
| `AI reply extracted: N nodes, M edges` | AI 回复提取结果 |

---

## 生产环境建议

### 配置调优

```json
{
  "brain-memory": {
    "config": {
      "recallMaxNodes": 10,
      "recallMaxDepth": 3,
      "recallStrategy": "adaptive",
      "decay": {
        "enabled": true,
        "recencyHalfLifeDays": 30,
        "timeDecayHalfLifeDays": 60
      },
      "reflection": {
        "turnReflection": false,
        "sessionReflection": true
      }
    }
  }
}
```

**说明：**

| 参数 | 建议 | 原因 |
|------|------|------|
| `recallMaxNodes` | 10-15 | 值过大会增加 Token 消耗 |
| `recallMaxDepth` | 2-3 | 过大会增加图遍历计算量 |
| `recallStrategy` | `adaptive` | 节点少时用 full，多时用 summary |
| `decay.enabled` | `true` | 让低价值记忆自然衰减 |
| `reflection.turnReflection` | `false` | 每轮都调用 LLM 会增加开销 |
| `reflection.sessionReflection` | `true` | 会话结束时执行，开销可控 |

### 定期维护

建议定期调用 `runMaintenance()` 保持图谱健康：

```typescript
// 每天执行一次维护
setInterval(async () => {
  await engine.runMaintenance();
}, 24 * 60 * 60 * 1000);
```

维护内容：去重 → 全局 PageRank → 社区检测 → 社区摘要。

### 数据库文件保护

- 限制数据库文件读取权限（`chmod 600`）
- 定期备份数据库文件
- 监控磁盘空间使用

---

## 安全注意事项

| 事项 | 说明 |
|------|------|
| **API Key 保管** | 使用环境变量或密钥管理器，不要硬编码 |
| **数据库文件权限** | 限制读取权限，防止未授权访问 |
| **HTTPS** | LLM / Embedding API 调用使用 HTTPS 端点 |
| **输入验证** | 节点类型、边类型、记忆分类在代码中已校验 |
| **SQL 注入防护** | 所有数据库操作使用参数化查询（`?` 占位符） |

---

## 常见问题

### 数据库锁定

**症状：** 运行时报错 `database is locked`

**原因：** 多个进程同时写入数据库

**解决：** 确保单实例运行，或使用 WAL 模式（已默认启用）

### Embedding 不可用

**症状：** 向量搜索不工作

**原因：** 未配置 Embedding API

**解决：** 系统自动降级为 FTS5 全文检索。如需向量搜索，配置 `embedding.apiKey` 和 `embedding.baseURL`。

### LLM 不可用

**症状：** 知识提取不工作

**原因：** 未配置 LLM API

**解决：** 配置 `llm.apiKey` 和 `llm.baseURL`。未配置时系统使用 Mock（仅日志警告）。

### 召回结果为空

**原因：** 图谱中无相关记忆节点

**解决：** 确保已有对话经过 `processTurn` 提取知识。检查 `recallMaxNodes` 和 `recallMaxDepth` 配置是否过低。

### 数据库文件过大

**解决：**
1. 运行 `runMaintenance()` 执行去重和社区检测
2. 开启 `decay.enabled` 让低价值记忆衰减
3. 定期备份后可考虑重置数据库（清空后重新开始）
