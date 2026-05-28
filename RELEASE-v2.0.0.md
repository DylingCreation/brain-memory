# brain-memory v2.0.0 — 认知金字塔审计闭环

> **发布日期**: 2026-05-28  
> **测试**: 847/847 通过 | **Lint**: 0 errors | **Build**: 通过  
> **NPM**: `memory-likehuman-pro@2.0.0`

---

## 🏗️ 架构重构

### ContextEngine 拆分完成
`ContextEngine` 从原来的上帝对象拆分为 **7 个独立领域服务**：
- `ExtractionService` — 知识提取
- `RecallService` — 记忆召回
- `MaintenanceService` — 图维护
- `HealthService` — 健康检查
- ✨ `FusionService` — 知识融合
- ✨ `ReflectionService` — 会话反思
- ✨ `ReasoningService` — 图推理

### LanceDB 角色明确
- `LanceDBStorageAdapter` 已标记 `@deprecated`
- LanceDB 正确用法：通过 `ISearchIndex` 作为伴随语义索引，`ContextEngine.setSearchIndex()` 注入
- SQLite 是唯一的 `IStorageAdapter` 实现（真值源）

### 统一错误码体系
- ✨ `BrainMemoryError` 基类 + 6 子类：`ConfigError` / `StorageError` / `LLMError` / `EmbeddingError` / `ValidationError` / `RuntimeError`

---

## 🔍 召回增强

| 特性 | 说明 |
|------|------|
| **路径感知融合 (D9)** | 四路种子标记来源，多路命中节点 ×1.2 加权 |
| **时间敏感性偏向 (D10)** | intent-analyzer 新增 `time_sensitive` 意图，recency 加权 |
| **前置信息量判断 (D8)** | `shouldRecall()` 过滤 "好的""继续""嗯" 等低信息量消息 |
| **缓存失效改进 (R2)** | RecallCache 改用所有节点 updatedAt 的 MD5 hash |

---

## 🧪 测试

- **847/847 用例通过**，0 失败
- 修复 5 项测试失败：source 列迁移 / getAllCommunities / c7-recall-baseline / SQLite 锁 / 导入路径
- ✨ E2E 测试补齐：4 场景（全生命周期 / 多会话 / scope 隔离 / 六层字段验证）

---

## 📦 其他

- 图缓存 TTL 30s → 60s
- `BmConfig` 新增语义分组：`EngineCoreConfig` / `RecallParamsConfig` / `MaintenanceParamsConfig`
- 认知金字塔分析报告 + 审核清单（15/15 项全部闭合）

---

## 🔗 Links

- 认知金字塔分析报告：`/home/yangchen/.openclaw/codinghelper/brain-memory-认知金字塔分析报告.md`
- CHANGELOG: [CHANGELOG.md](./CHANGELOG.md)
- 架构文档: [docs/architecture.md](./docs/architecture.md)
