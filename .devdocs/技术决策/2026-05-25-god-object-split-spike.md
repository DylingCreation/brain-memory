# S-5 God Object 拆分 — 兼容性调研

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **调研人** | OpenClaw CodingHelper |
| **调研目的** | 分析 store.ts (595行) 的函数依赖全景，设计无回归的拆分方案 |

## 一、现状

store.ts 包含 31 个导出函数，涵盖 6 个功能域：

| 功能域 | 函数数 | 主要外部消费者 |
|--------|--------|---------------|
| 节点 CRUD | 7 | context.ts, reflection/store.ts, ui/nodes |
| 边 CRUD | 4 | context.ts, fusion/analyzer.ts, graph/community.ts, ui/graph |
| 向量操作 | 5 | recaller/recall.ts, retriever/vector-recall.ts, admission-control |
| 社区操作 | 6 | recaller/recall.ts |
| 消息操作 | 4 | format/assemble.ts |
| 图遍历/搜索 | 4 | recaller/recall.ts, retriever/*, context.ts |

## 二、拆分策略

**最小影响原则**: store.ts 保留为 barrel re-export，消费者无感知。

```
store/
├── store.ts                  ← barrel re-export (保留兼容)
├── storage/                   ← 子模块
│   ├── nodes.ts              ← 节点 CRUD
│   ├── edges.ts              ← 边 CRUD
│   ├── vectors.ts            ← 向量操作
│   ├── communities.ts        ← 社区操作
│   ├── messages.ts           ← 消息操作
│   └── search.ts             ← 图遍历 + FTS5 搜索
├── search/                    ← ISearchIndex (S-2)
│   ├── index.ts              ← ISearchIndex 接口
│   └── lancedb.ts            ← LanceDBSearchIndex 实现
├── adapter.ts                ← 不变
├── db.ts                     ← 不变
├── migrate.ts                ← 不变
├── sqlite-adapter.ts         ← import 路径更新
└── lancedb-adapter.ts        ← 不变
```

## 三、风险与缓解

| 风险 | 缓解 |
|------|------|
| 循环依赖（子模块互相引用） | 公共工具函数（toNode, normalizeName）保留在 store.ts 或独立 utils |
| sqlite-adapter.ts 大量 import 需更新 | 改为从 store.ts barrel 统一 import |
| 测试文件直接 import store/store.ts | 37 个测试文件 — 无需改动（barrel 不变） |
| LanceDB adapter 引用 store 函数 | 从 barrel import，不受拆分影响 |

## 四、实施计划

1. 创建 store/storage/ 子目录
2. 按功能域拆分 store.ts → 各子模块文件
3. 公共辅助函数（toBmNode, normalizeName）保留在 store.ts
4. store.ts 改为 re-export barrel
5. sqlite-adapter.ts import 从 store.ts 统一入口
6. 全量测试验证
