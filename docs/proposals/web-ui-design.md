# brain-memory Web Control UI 完整设计方案

> 版本: v1.0-draft | 日期: 2026-05-24 | 前置依赖: scope-upgrade-v2 完成
> 
> 为 brain-memory 提供一个完整的 Web 管理界面：记忆浏览、知识图谱可视化、
> 节点编辑、配置管理、实时监控。

---

## 目录

1. [总体架构](#1-总体架构)
2. [部署模型](#2-部署模型)
3. [后端 API 设计](#3-后端-api-设计)
4. [WebSocket 事件协议](#4-websocket-事件协议)
5. [前端组件树](#5-前端组件树)
6. [功能模块详设](#6-功能模块详设)
7. [数据流](#7-数据流)
8. [安全模型](#8-安全模型)
9. [开发路线图](#9-开发路线图)
10. [文件清单](#10-文件清单)

---

## 1. 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Vue 3 SPA (Tab 切换, 零路由)                             │  │
│  │  ┌─────────┬──────────┬──────────┬─────────┬───────────┐  │  │
│  │  │ 仪表盘  │ 图谱视图 │ 节点列表  │ 节点编辑 │ 配置管理  │  │  │
│  │  └─────────┴──────────┴──────────┴─────────┴───────────┘  │  │
│  │              ↑ HTTP REST  ↑ WebSocket                      │  │
│  └──────────────┼────────────┼────────────────────────────────┘  │
└─────────────────┼────────────┼───────────────────────────────────┘
                  │            │
┌─────────────────┼────────────┼───────────────────────────────────┐
│  OpenClaw Gateway                                                │
│  ┌──────────────┴────────────┴──────────────────────────────┐    │
│  │  brain-memory plugin                                      │    │
│  │  ┌──────────────────┐  ┌───────────────────────────┐     │    │
│  │  │ Hono HTTP Server │  │ WebSocket Server (ws)     │     │    │
│  │  │ GET /api/stats   │  │ → node:created            │     │    │
│  │  │ GET /api/nodes   │  │ → node:updated             │     │    │
│  │  │ POST /api/nodes  │  │ → node:deprecated          │     │    │
│  │  │ PUT /api/nodes/:id│ │ → edge:changed             │     │    │
│  │  │ GET /api/config   │  │ → config:changed           │     │    │
│  │  │ PUT /api/config   │  │ → stats:updated            │     │    │
│  │  └────────┬─────────┘  └─────────────┬─────────────┘     │    │
│  │           │ IStorageAdapter           │ 事件发射器         │    │
│  │  ┌────────┴──────────────────────────┴──────────────┐    │    │
│  │  │           ContextEngine / Store                    │    │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │    │
│  │  │  │ SQLite   │  │ LanceDB  │  │ openclaw.json │    │    │
│  │  │  │ (真值)   │  │ (向量)   │  │ (配置)       │    │    │
│  │  │  └──────────┘  └──────────┘  └──────────────┘    │    │
│  │  └──────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**关键设计决策**：
- UI Server 嵌入在插件进程中，随 `activate()` 启动，随 `deactivate()` 关闭
- Hono 处理 HTTP REST + WebSocket 升级（同一端口）
- 数据直接通过 `IStorageAdapter` 读取，不经过中间层
- 配置通过读/写 `openclaw.json` 的 `plugins.entries['brain-memory']` 段落实现

---

## 2. 部署模型

### 2.1 嵌入式模式（默认）

```
用户 npm install brain-memory
  → Gateway 启动
  → 插件 activate()
  → UI Server 启动在 http://localhost:{auto-port}
  → 控制台打印: [brain-memory] UI available at http://localhost:19407
  → 浏览器打开即可
```

端口选择策略：
1. 尝试复用 Gateway 端口（若 Gateway 暴露挂载子路由的能力）
2. 否则自动分配端口（从 19407 开始尝试，最多试 10 次）
3. 打印 URL 到控制台 + 日志文件

### 2.2 独立部署模式（可选）

```bash
# package.json 新增
"brain-memory-ui": "node dist/ui/server.js"

# 使用
brain-memory-ui --db ~/.openclaw/brain-memory.db --port 19407
```

相同的代码，独立的进程。通过 CLI 参数指定数据库路径。

### 2.3 npm 分发

```
brain-memory/
├── dist/
│   ├── index.js            # 插件入口（现已有）
│   ├── ui/
│   │   ├── server.js       # UI HTTP/WS Server（预构建）
│   │   ├── public/         # 前端构建产物
│   │   │   ├── index.html
│   │   │   ├── assets/     # JS/CSS bundles (Vite 构建)
│   │   │   └── favicon.svg
│   │   └── ...             
│   └── ...
├── ui/                      # 前端源码（保留，可选自定义构建）
│   ├── src/
│   │   ├── App.vue
│   │   ├── components/
│   │   ├── views/
│   │   └── ...
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── package.json
```

`package.json` 的 `files` 字段包含 `dist/ui/**/*`，npm publish 时自动打包。

---

## 3. 后端 API 设计

### 3.1 基础信息

| 属性 | 值 |
|------|-----|
| 格式 | JSON |
| 编码 | UTF-8 |
| 认证 | Bearer token（与 Gateway auth token 一致） |

### 3.2 REST 端点

#### 统计与概览

```
GET /api/stats
  响应: {
    totalNodes: 128,
    activeNodes: 120,
    deprecatedNodes: 8,
    totalEdges: 45,
    nodesByCategory: { tasks: 42, skills: 28, patterns: 10, ... },
    edgeTypes: { USED_SKILL: 15, SOLVED_BY: 8, ... },
    vectorCount: 120,
    communityCount: 5,
    schemaVersion: 2,
    // 额外统计
    recentActivity: {
      last24h: { created: 5, updated: 12, recalled: 30 },
      last7d: { created: 18, updated: 45, recalled: 200 },
    },
    storageSize: "2.3 MB",
    topCommunities: [
      { id: "c1", summary: "TypeScript development patterns", nodeCount: 15 }
    ]
  }

GET /api/stats/decay
  响应: {
    healthy: 100,        // importance > 0.7
    fading: 15,          // 0.3 < importance <= 0.7
    forgotten: 5,        // importance <= 0.3
    decayCurve: [
      { days: 0, retention: 1.0 },
      { days: 30, retention: 0.8 },
      { days: 60, retention: 0.5 },
      ...
    ]
  }

GET /api/stats/scopes
  响应: {
    platforms: { qqbot: 80, webchat: 40, null: 8 },
    agents: { main: 100, todo: 28 },
    chats: { "...": 30, "...": 25, null: 8 },
    unclassified: 8    // scope 全 NULL 的旧数据
  }
```

#### 节点 CRUD

```
GET /api/nodes
  查询参数:
    ?category=tasks,skills    // 分类过滤（逗号分隔）
    &type=TASK                // 节点类型
    &status=active            // active | deprecated | all
    &scope_platform=qqbot     // scope 维度过滤
    &scope_agent=main
    &scope_chat=c123
    &search=TypeScript        // 文本搜索
    &sort=pagerank            // pagerank | updated | created | importance
    &order=desc               // asc | desc
    &limit=50                 // 默认 50
    &offset=0                 // 分页
  响应: {
    total: 128,
    limit: 50,
    offset: 0,
    nodes: [ { ...BmNode }, ... ]
  }

GET /api/nodes/:id
  响应: {
    node: { ...BmNode },
    edges: {
      from: [ { ...BmEdge }, ... ],   // 出边
      to: [ { ...BmEdge }, ... ],     // 入边
    },
    community: { id: "c1", summary: "...", peers: [ ... ] },
    decayCurve: [ ... ],              // 该节点的衰减曲线
    episodicContext: [                 // 源对话片段
      { sessionId: "...", role: "user", text: "..." }
    ]
  }

POST /api/nodes
  请求体: {
    name: "use-d3-force-layout",
    type: "SKILL",
    category: "skills",
    description: "使用 D3.js force layout 实现力导向图",
    content: "具体操作步骤...",
    source: "manual",
    scope: {
      platform: "webchat",
      workspace: "E:\\OpenClaw\\.openclaw\\workspace",
      agent: "main",
      user: null,
      chat: null,
      thread: null
    }
  }
  响应: 201 { node: { ...BmNode }, isNew: true }

PUT /api/nodes/:id
  请求体: {
    description: "更新后的描述",
    content: "更新后的内容",
    category: "cases"
  }
  响应: { node: { ...BmNode } }

DELETE /api/nodes/:id
  响应: 200 { deprecated: true }  // 软删除

POST /api/nodes/merge
  请求体: { keepId: "n-xxx", mergeId: "n-yyy" }
  响应: 200 { merged: true, kept: { ...BmNode } }
```

#### 边查询

```
GET /api/edges
  查询参数: ?from_id=n-xxx | ?to_id=n-xxx | ?type=USED_SKILL | ?session_id=s-xxx
  响应: { edges: [ ...BmEdge ] }

POST /api/edges
  请求体: {
    fromId: "n-xxx",
    toId: "n-yyy",
    type: "USED_SKILL",
    instruction: "用于渲染力导向图",
    sessionId: "manual"
  }
  响应: 201 { edge: { ...BmEdge } }
```

#### 图谱数据

```
GET /api/graph
  查询参数:
    ?category=tasks,skills    // 节点分类过滤
    &maxNodes=200             // 最大节点数（默认 200）
    &scope_platform=qqbot     // scope 过滤
    &scope_agent=main
  → 返回全量图谱数据供前端 D3 渲染
  响应: {
    nodes: [ { id, name, type, category, pagerank, communityId, importance } ],
    edges: [ { id, fromId, toId, type } ],
    communities: [ { id, summary, color } ]
  }

GET /api/graph/community/:id
  响应: {
    community: { id, summary, nodeCount, embedding },
    nodes: [ ... ],
    edges: [ ... ]
  }
```

#### 配置管理

```
GET /api/config
  响应: {
    config: { ...完整 BmConfig },
    schema: { ...JSON Schema },     // 用于前端动态生成表单
    source: "openclaw.json",
    lastModified: "2026-05-24T08:00:00Z"
  }

PUT /api/config
  请求体: { ...部分或完整 BmConfig }
  响应: {
    saved: true,
    message: "配置已保存，重启 Gateway 后生效",
    requiresRestart: true,
    diff: {
      changed: ["recallMaxNodes", "engine"],
      unchanged: 58
    }
  }
```

#### 记忆召回测试

```
POST /api/recall/test
  请求体: {
    query: "如何在 TypeScript 中处理异步错误",
    scope: { platform: "webchat", agent: "main", ... },
    maxNodes: 10
  }
  响应: {
    query: "...",
    results: [ { node: ..., score: 0.92, path: "vector" } ],
    timingMs: 12.5,
    debug: {
      preciseSeeds: 3,
      generalizedSeeds: 2,
      pprIterations: 20,
      decayApplied: true
    }
  }
```

### 3.3 路由设计

```
/api/stats          → StatsController
/api/stats/decay    → StatsController#decay
/api/stats/scopes   → StatsController#scopes
/api/nodes          → NodesController
/api/nodes/:id      → NodesController#detail
/api/nodes/merge    → NodesController#merge
/api/edges          → EdgesController
/api/graph          → GraphController
/api/graph/community/:id → GraphController#community
/api/config         → ConfigController
/api/recall/test    → RecallController
```

用 Hono 的 `route` 分组，每个 Controller 是一个独立的 `Hono` 实例。

---

## 4. WebSocket 事件协议

### 4.1 连接

```
ws://localhost:19407/ws?token={gateway_auth_token}
```

### 4.2 服务端 → 客户端事件

| 事件 | payload | 触发时机 |
|------|---------|---------|
| `stats:updated` | `{ ...StorageStats, timestamp }` | 每 10 秒推送 + 变更时立刻推送 |
| `node:created` | `{ node: BmNode, sessionId }` | 新记忆写入后 |
| `node:updated` | `{ node: BmNode, changes: string[] }` | 节点被编辑/验证/访问后 |
| `node:deprecated` | `{ nodeId: string }` | 节点被软删除 |
| `edge:created` | `{ edge: BmEdge }` | 新边建立后 |
| `edge:deleted` | `{ edgeId: string }` | 边被移除后 |
| `config:changed` | `{ diff: string[], requiresRestart: true }` | 配置被 Web UI 修改后 |
| `maintenance:completed` | `{ type: 'decay'|'compact'|'prune', affectedNodes: number }` | 自动维护完成后 |

### 4.3 客户端 → 服务端事件

| 事件 | payload | 说明 |
|------|---------|------|
| `subscribe:node` | `{ nodeId: string }` | 订阅某个节点的实时更新 |
| `unsubscribe:node` | `{ nodeId: string }` | 取消订阅 |

### 4.4 实现要点

```typescript
// src/ui/server.ts
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/ws';
import { WebSocketServer } from 'ws';

const eventBus = new EventEmitter();  // 全局事件总线

// 存储层操作后发射事件
async function upsertNode(input) {
  const result = await storage.upsertNode(input, sessionId);
  eventBus.emit('node:created', { node: result.node, sessionId });
  eventBus.emit('stats:updated', await storage.getStats());
  return result;
}

// WebSocket 广播
const clients = new Set<WebSocket>();

eventBus.on('node:created', (data) => {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'node:created', data }));
    }
  }
});

// Hono route
app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(_, ws) {
    clients.add(ws);
  },
  onClose() {
    clients.delete(ws);
  },
})));
```

---

## 5. 前端组件树

```
App.vue
├── AppHeader.vue                  # 标题栏 + 连接状态指示灯
├── AppTabs.vue                    # Tab 导航栏
│
├── DashboardView.vue              # Tab 1: 仪表盘
│   ├── StatCard.vue               #   统计卡片 (×4)
│   ├── CategoryChart.vue          #   分类分布柱状图 (D3)
│   ├── DecayStatus.vue            #   衰减状态概览
│   ├── RecentActivity.vue         #   最近活动列表
│   └── ScopeOverview.vue          #   Scope 分布概览
│
├── GraphView.vue                  # Tab 2: 知识图谱
│   ├── GraphCanvas.vue            #   D3 force-layout 画布
│   │   ├── forceSimulation        #   力导向布局引擎
│   │   ├── dragBehavior           #   拖拽行为
│   │   └── zoomBehavior           #   缩放行为
│   ├── GraphToolbar.vue           #   图谱工具栏
│   │   ├── FilterByCategory.vue   #   分类过滤
│   │   ├── FilterByScope.vue      #   Scope 过滤
│   │   └── SearchHighlight.vue    #   搜索高亮
│   ├── GraphLegend.vue            #   图例（8类颜色 + 11种边样式）
│   └── NodeTooltip.vue            #   节点悬浮 tooltip
│
├── NodesView.vue                  # Tab 3: 节点列表
│   ├── NodesFilter.vue            #   搜索 + 过滤栏
│   ├── NodesTable.vue             #   节点表格
│   │   └── NodeRow.vue            #   节点行
│   └── NodesPagination.vue        #   分页
│
├── NodeDetailModal.vue            # 节点详情模态框（覆层）
│   ├── NodeHeader.vue             #   名称 + 类型 + 分类
│   ├── NodeContent.vue            #   内容 + 描述
│   ├── NodeMetadata.vue           #   元数据（PageRank/重要性/验证数）
│   ├── NodeDecayCurve.vue         #   衰减曲线 (D3)
│   ├── NodeEdges.vue              #   关联边列表
│   ├── NodeCommunity.vue          #   所属社区
│   ├── NodeEpisodic.vue           #   源对话片段
│   └── NodeActions.vue            #   编辑/删除/合并按钮
│
├── NodeEditorModal.vue            # 节点编辑模态框
│   ├── NodeForm.vue               #   表单（name/type/category/content/scope）
│   └── NodePreview.vue            #   预览
│
├── ConfigView.vue                 # Tab 4: 配置管理
│   ├── ConfigForm.vue             #   动态生成的 JSON Schema 表单
│   │   ├── ConfigSection.vue      #   配置分组（engine/decay/reflection/...）
│   │   ├── ConfigField.vue        #   单个字段（支持 string/number/boolean/enum）
│   │   └── ConfigNestedField.vue  #   嵌套对象字段
│   ├── ConfigDiff.vue             #   变更预览
│   └── ConfigStatus.vue           #   保存状态 + 重启提示
│
└── RecallTestView.vue             # Tab 5: 召回测试
    ├── RecallInput.vue            #   查询输入 + scope 选择
    ├── RecallResults.vue          #   召回结果列表（带分数）
    └── RecallDebug.vue            #   调试信息（种子/路径/PPR/衰减）
```

---

## 6. 功能模块详设

### 6.1 仪表盘 (DashboardView)

**布局**：
```
┌───────────────────────────────────────────────────────────┐
│  📊 记忆概览                                              │
├───────────┬───────────┬───────────┬───────────────────────┤
│ 128       │ 45        │ 23        │ 2.3 MB               │
│ 总节点    │ 边关系    │ 社区      │ 存储大小             │
├───────────┴───────────┴───────────┴───────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────┐ │
│  │ 分类分布 (D3 柱状图)     │  │ 衰减状态 (D3 环形图)   │ │
│  │ tasks    ████████ 42    │  │  ● 健康 100            │ │
│  │ skills   ██████ 28     │  │  ○ 衰退中 15           │ │
│  │ patterns ███ 10        │  │  ◌ 被遗忘 5            │ │
│  │ ...                    │  │                         │ │
│  └─────────────────────────┘  └─────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 📋 最近活动                                         │ │
│  │ + 新增 "use-d3-force-layout" (SKILL)  · 2分钟前     │ │
│  │ ↑ 更新 "typescript-debugging" (SKILL)  · 5分钟前    │ │
│  │ ↻ 召回 "implement-memory-system" (TASK)  · 8分钟前  │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

**数据来源**：`GET /api/stats` + `GET /api/stats/decay`（初始化时），后续通过 WebSocket `stats:updated` 增量刷新。

**D3 图表**：
- 分类柱状图：D3 `bandScale` + 8 类配色
- 衰减环形图：D3 `arc` + 三层环形（健康/衰退中/被遗忘）
- 不需要动画，纯静态渲染 + 数据更新时重绘

### 6.2 知识图谱 (GraphView)

**核心功能**：

| 功能 | 实现 |
|------|------|
| 力导向布局 | D3 `forceSimulation`：`forceLink` + `forceManyBody` + `forceCenter` + `forceCollide` |
| 拖拽 | D3 `drag` behavior，拖拽中 alpha 保持 > 0.1 |
| 缩放 | D3 `zoom` behavior，范围 0.1x ~ 3x |
| 节点颜色 | 8 类记忆配色：`task=#4CAF50`, `skill=#2196F3`, `event=#F44336`, ... |
| 节点大小 | 与 PageRank 成正比（范围 6px ~ 24px） |
| 边样式 | 11 种边类型不同虚线/颜色：`USED_SKILL` 实线, `RELATED_TO` 虚线... |
| 悬浮 tooltip | Vue `<Teleport>` 实现，显示 name + type + category + pagerank |
| 点击节点 | 打开 `NodeDetailModal` |
| 搜索高亮 | 搜索词匹配的节点放大 + 发光效果 |
| 社区着色 | 同一个 community 的节点用相近色系 |
| 节点标签 | 每个节点下方显示截断 name（最多 15 字符） |

**性能优化**：
- 节点数 > 300 时关闭节点标签
- 节点数 > 500 时简化边渲染（直线代替曲线）
- 默认只加载 top-200 节点（按 PageRank），用户可通过过滤调整
- `requestAnimationFrame` 节流 tick 处理

**过滤面板**：
```
按分类:  [x] tasks  [x] skills  [x] events  [ ] profile  ...
按 Scope: [platform: qqbot ▼]  [agent: main ▼]
按社区:   [全部社区 ▼]
```

### 6.3 节点列表 (NodesView)

**功能**：
- 分页列表（50 条/页）
- 搜索：支持名称/描述/内容的关键词搜索（调后端 FTS5）
- 过滤：按分类、类型、状态、scope 维度、时间范围
- 排序：PageRank / Importance / 更新时间 / 访问次数
- 多选：批量删除/批量导出
- 手动添加按钮 → 打开 `NodeEditorModal`

**每一行显示**：
```
┌──────────────────────────────────────────────────────────┐
│ 🟢 TASK  implement-ai-agent-memory-system                │
│    tasks · pagerank:0.92 · imp:0.85 · 5次验证 · 2分钟前 │
│    scope: qqbot/main/c123                                │
└──────────────────────────────────────────────────────────┘
```

### 6.4 节点详情 (NodeDetailModal)

全屏覆层，显示一个节点的全部信息：

**布局**：
```
┌──────────────────────────────────────────────────────────┐
│  ← 返回                   节点详情               [编辑]  │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌────────────────────────────────┐│
│  │ 名称             │  │ 元数据                         ││
│  │ implement-memory │  │ PageRank: 0.92  │ 重要性: 0.85 ││
│  │ TASK · tasks     │  │ 验证: 5        │ 访问: 23     ││
│  │ ● active         │  │ 社区: TS patterns              ││
│  │                  │  │ scope: qqbot/main/u1/c1        ││
│  └──────────────────┘  └────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────┐│
│  │ 描述                                                ││
│  │ 为 AI Agent 实现统一的记忆系统，包含知识图谱...     ││
│  └──────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────┐│
│  │ 完整内容                                            ││
│  │ 详细的实现方案：1. 使用 SQLite 存储... 2. 使用...   ││
│  └──────────────────────────────────────────────────────┘│
│  ┌─────────────────┐  ┌────────────────────────────────┐ │
│  │ 衰减曲线 (D3 线) │  │ 关联边 (6条)                  │ │
│  │ ●─────●──        │  │ → 用了 typescript-dev (SKILL) │ │
│  │ 30d  60d  90d    │  │ → 解决了 memory-leak (EVENT) │ │
│  │                  │  │ ← 被 implement-agent (TASK)   │ │
│  └─────────────────┘  └────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐│
│  │ 源对话片段                                          ││
│  │ User: "我觉得 Agent 的上下文越来越长..."            ││
│  │ AI:   "这是因为没有做记忆衰减..."                   ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 6.5 节点编辑器 (NodeEditorModal)

**功能**：
- 新建模式：所有字段可编辑
- 编辑模式：部分字段锁定（id/createdAt），其余可改
- 手动添加标记：`source: 'manual'`
- Scope 选择器：六层下拉（platform/workspace/agent/user/chat/thread），每层可选填
- 实时预览：编辑内容时右侧显示渲染后的效果

**表单字段**：
```
name*:        [___________________________]
type*:        [TASK ▼] [SKILL] [EVENT]
category*:    [tasks ▼] (八类)
description:  [___________________________]
content*:     [___________________________]
              [___________________________]  (多行)
scope:
  platform:   [webchat ▼]
  workspace:  [___________________________]
  agent:      [main ▼]
  user:       [___________________________]
  chat:       [___________________________]
  thread:     [___________________________]
```

### 6.6 配置管理 (ConfigView)

**布局**：
```
┌──────────────────────────────────────────────────────────┐
│  ⚙ 配置管理                      状态：✅ 已同步        │
├──────────────────────────────────────────────────────────┤
│  ┌─ 引擎配置 ──────────────────────────────────────────┐ │
│  │ 运行模式:   [graph ▼] [vector] [hybrid]            │ │
│  │ 存储后端:   [sqlite ▼] [lancedb]                   │ │
│  │ 数据库路径: [~/openclaw/brain-memory.db]            │ │
│  │ 压缩轮数:   [6______]                               │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─ 衰减配置 ──────────────────────────────────────────┐ │
│  │ ☑ 启用衰减                                          │ │
│  │ 近因半衰期(天): [30___]  近因权重: [0.4_]           │ │
│  │ 频率权重:       [0.3_]  内在权重: [0.3_]            │ │
│  │ 核心衰减底线:   [0.9_]  工作衰减底线: [0.7_]        │ │
│  │ 外围衰减底线:   [0.5_]                              │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─ LLM 配置 ──────────────────────────────────────────┐ │
│  │ Base URL:  [https://api.openai.com/v1]              │ │
│  │ Model:     [gpt-4o-mini ▼]                          │ │
│  │ API Key:   [••••••••••]            [显示/隐藏]      │ │
│  └─────────────────────────────────────────────────────┘ │
│  ... (更多分组：Embedding / 反思 / 融合 / 推理 / 噪声)   │
├──────────────────────────────────────────────────────────┤
│                    [恢复默认]  [保存配置]                 │
│  ⚠ 保存后需要重启 Gateway 才能生效                       │
└──────────────────────────────────────────────────────────┘
```

**实现要点**：
1. 动态表单：根据 `configSchema` (JSON Schema) 递归渲染表单字段
2. 支持类型：`string`、`number`、`boolean`、`enum`、`object`（嵌套）
3. API Key 字段用密码输入框 + 显示/隐藏切换
4. 保存前显示 diff：高亮变更的字段
5. 保存后触发 `config:changed` WebSocket 事件
6. 保存后显示重启提示横幅（含重启命令 `openclaw gateway restart`）

### 6.7 召回测试 (RecallTestView)

**目的**：让用户直观理解"给定查询，系统会召回什么记忆"。也是调试 scope 过滤的工具。

**布局**：
```
┌──────────────────────────────────────────────────────────┐
│  🧪 召回测试                                             │
├──────────────────────────────────────────────────────────┤
│  查询: [如何在 TypeScript 中处理异步错误____________]    │
│  Scope: [platform: webchat ▼] [agent: main ▼]            │
│  最大节点: [10___]                    [执行测试]         │
├──────────────────────────────────────────────────────────┤
│  耗时: 12.5ms  召回: 5 个节点                             │
│                                                          │
│  #1 ████████████████████ 0.92 向量匹配                    │
│     typescript-error-handling (SKILL)                    │
│     "使用 try/catch + async/await 处理异步错误..."       │
│                                                          │
│  #2 ██████████████████░░ 0.85 图谱遍历                    │
│     async-patterns-best-practices (PATTERN)              │
│     "异步编程的最佳实践包括..."                           │
│  ...                                                     │
│                                                          │
│  📊 调试信息                                             │
│  精确路径种子: 3 | 泛化路径种子: 2 | PPR 迭代: 20        │
│  FTS5 命中: 2 | 向量命中: 3 | 时间衰减: 已应用           │
└──────────────────────────────────────────────────────────┘
```

### 6.8 Canvas UI 集成

**定位**：Web UI 的轻量子集，嵌入 OpenClaw 对话中。

**场景**：
- `/memory-status` → 显示一个迷你仪表盘卡片（总节点数、本轮提取数、衰减状态）
- `/memory-recall <query>` → 显示召回测试结果
- `/memory-node <id>` → 显示节点详情

**实现方式**：Canvas UI 通过 HTML iframe 嵌入 Web UI 的特定路由（如 `/embed/dashboard`、`/embed/recall`），Web UI 提供精简版布局（无 Tab 栏、无导航）。

---

## 7. 数据流

### 7.1 首次加载

```
浏览器                          Server                     Storage
  │                                │                          │
  │──── GET /api/stats ────────────→                          │
  │                                │──── storage.getStats() ──→
  │←── { stats } ─────────────────│←── { stats } ────────────│
  │                                │                          │
  │──── GET /api/config ──────────→                          │
  │                                │──── fs.readFile ─────────→
  │←── { config, schema } ────────│←── { config } ───────────│
  │                                │                          │
  │──── WS /ws?token=xxx ─────────→                          │
  │←── { event: "stats:updated" } │                          │
  │←── { event: "connected" } ────│                          │
```

### 7.2 节点搜索与加载

```
用户输入搜索词 "TypeScript"
  │
  ├→ GET /api/nodes?search=TypeScript&limit=50
  │    └→ storage.searchNodes("TypeScript", 50, scopeFilter)
  │         └→ FTS5 → LIKE fallback → 返回 28 条结果
  │
  └→ 用户点击某个节点
       └→ GET /api/nodes/n-xxx
            └→ storage.findNodeById("n-xxx")
                 + storage.findEdgesFrom("n-xxx")
                 + storage.findEdgesTo("n-xxx")
                 + storage.getCommunity(communityId)
```

### 7.3 手动添加记忆

```
用户填写表单 → POST /api/nodes
  │
  ├→ storage.upsertNode(input, "manual")
  │    └→ 写入 SQLite bm_nodes
  │    └→ 更新 FTS5 索引
  │    └→ 如果启用向量：embed + saveVector
  │
  ├→ eventBus.emit('node:created', { node })
  │    └→ WS 广播到所有客户端
  │
  └→ eventBus.emit('stats:updated')
       └→ WS 广播最新统计
```

### 7.4 配置保存

```
用户编辑配置 → PUT /api/config
  │
  ├→ 读取 openclaw.json
  ├→ 深度合并 plugins.entries['brain-memory'].config
  ├→ JSON Schema 校验
  ├→ 写回 openclaw.json (rename → 原子写入)
  ├→ 记录 config-audit.jsonl
  ├→ 创建 .bak 备份
  │
  ├→ eventBus.emit('config:changed', { diff, requiresRestart: true })
  │    └→ WS 广播
  │
  └→ 返回 { saved: true, message: "配置已保存，重启 Gateway 后生效" }
```

---

## 8. 安全模型

### 8.1 认证

```
HTTP 请求:
  Authorization: Bearer {gateway_auth_token}

WebSocket 连接:
  ws://localhost:19407/ws?token={gateway_auth_token}

无 token → 401 Unauthorized
```

**实现**：Hono middleware 读取 `Authorization` header / query string，与 Gateway 的 `gateway.auth.token` 比较。

```typescript
const authMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
    || c.req.query('token');
  if (!token || token !== gatewayAuthToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};
```

### 8.2 访问控制

| 操作 | 风险 | 控制 |
|------|------|------|
| 查看记忆 | 泄露对话内容 | Bearer token 认证 |
| 删除记忆 | 破坏知识库 | Bearer token 认证 + 软删除 + 日志 |
| 修改配置 | 破坏系统行为 | Bearer token 认证 + 备份 + 审计日志 |
| API Key 查看 | 密钥泄露 | 密码框默认隐藏 + 后端返回掩码 |

### 8.3 网络绑定

- **默认**：`bind: 'loopback'`，仅 `localhost` 可访问
- **可选**：`bind: 'lan'`，局域网可访问（用户配置开启）

---

## 9. 开发路线图

### Phase 1 — 仪表盘 (MVP, 2-3 天)

```
目标：能看见记忆状态
├── Hono HTTP Server 搭建
├── GET /api/stats 完成
├── GET /api/nodes (列表+搜索+分页) 完成
├── DashboardView (统计卡片 + 类别图)
├── NodesView (搜索 + 列表 + 分页)
├── NodeDetailModal (基本信息展示)
└── 前端构建 + npm 打包流程
```

### Phase 2 — 知识图谱 + 编辑 (2 天)

```
目标：能看图、能编辑
├── GET /api/graph 完成
├── GraphView (D3 力导向图 + 拖拽 + 缩放 + Tooltip)
├── NodeEditorModal (手动添加记忆表单)
├── PUT /api/nodes/:id + DELETE /api/nodes/:id
├── POST /api/nodes/merge
├── GET /api/edges + POST /api/edges
└── NodeDetailModal 完整版（衰减曲线 + 源对话）
```

### Phase 3 — 配置 + 实时 + Canvas (2 天)

```
目标：能改配置、实时更新、对话内卡片
├── GET/PUT /api/config
├── ConfigView (JSON Schema 动态表单)
├── WebSocket 事件系统
├── Stats 实时推送
├── Canvas UI 嵌入 (/embed/dashboard, /embed/recall)
└── RecallTestView
```

### Phase 4 — 打磨 (1 天)

```
目标：开源级别的体验
├── 错误处理 + Loading 状态 + 空状态
├── 响应式布局 (桌面 + 平板)
├── 暗色模式
├── i18n 基础设施 (zh-CN)
├── 性能优化 (大图谱 + 虚拟滚动)
└── 文档 + CONTRIBUTING 更新
```

---

## 10. 文件清单

### 新增文件

```
brain-memory/
├── src/
│   └── ui/
│       ├── server.ts              # Hono HTTP/WS Server 入口
│       ├── controllers/
│       │   ├── stats.ts           # /api/stats/*
│       │   ├── nodes.ts           # /api/nodes/*
│       │   ├── edges.ts           # /api/edges/*
│       │   ├── graph.ts           # /api/graph/*
│       │   ├── config.ts          # /api/config/*
│       │   └── recall.ts          # /api/recall/*
│       ├── middleware/
│       │   ├── auth.ts            # Bearer token 认证
│       │   └── error.ts           # 错误处理
│       └── ws/
│           └── event-bus.ts       # WebSocket 事件总线
│
├── ui/                             # 前端源码
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.ts                # Vue 入口
│       ├── App.vue                # 根组件
│       ├── components/            # 通用组件
│       │   ├── AppHeader.vue
│       │   ├── AppTabs.vue
│       │   ├── StatCard.vue
│       │   ├── SearchBar.vue
│       │   ├── ScopeSelector.vue
│       │   └── LoadingSpinner.vue
│       ├── views/                 # 页面视图
│       │   ├── DashboardView.vue
│       │   ├── GraphView.vue
│       │   ├── NodesView.vue
│       │   ├── ConfigView.vue
│       │   └── RecallTestView.vue
│       ├── modals/                # 模态框
│       │   ├── NodeDetailModal.vue
│       │   └── NodeEditorModal.vue
│       ├── stores/                # 状态管理
│       │   ├── stats.ts           # 统计 store
│       │   ├── nodes.ts           # 节点 store
│       │   ├── graph.ts           # 图谱 store
│       │   ├── config.ts          # 配置 store
│       │   └── websocket.ts       # WS 连接 store
│       ├── api/                   # HTTP 客户端
│       │   └── client.ts          # fetch 封装 + auth
│       ├── d3/                    # D3 可视化
│       │   ├── force-graph.ts     # 力导向图
│       │   ├── bar-chart.ts       # 柱状图
│       │   ├── donut-chart.ts     # 环形图
│       │   └── line-chart.ts      # 衰减曲线
│       └── i18n/
│           └── zh-CN.ts           # 中文字符串
│
├── test/
│   └── ui/
│       ├── server.test.ts         # Server 集成测试
│       ├── api.test.ts            # API 端点测试
│       └── ws.test.ts             # WebSocket 测试
│
└── docs/
    └── proposals/
        ├── scope-upgrade-v2.md    # scope 升级方案
        └── web-ui-design.md       # 本文件
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `package.json` | 新增 `"brain-memory-ui"` bin 入口；新增 `scripts.build:ui`；`files` 加 `dist/ui/**/*` |
| `src/plugin/core.ts` | `activate()` 中启动 UI Server |
| `openclaw.plugin.json` | `configSchema` 补全到 100% 对齐 DEFAULT_CONFIG |

---

## 附录 A：前端依赖清单

```json
{
  "dependencies": {
    "vue": "^3.5.x",
    "d3": "^7.9.x",
    "d3-force": "^3.x"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.x",
    "vite": "^6.x",
    "typescript": "^5.x",
    "vue-tsc": "^2.x"
  }
}
```

**前端构建产物大小预估**：~80KB gzip（Vue core ~40KB + D3 ~30KB + 业务代码 ~10KB）

## 附录 B：后端依赖清单

```json
{
  "dependencies": {
    "hono": "^4.x",
    "ws": "^8.x"
  }
}
```

总共新增 **3 个** npm 依赖（不含前端 devDependencies）。
