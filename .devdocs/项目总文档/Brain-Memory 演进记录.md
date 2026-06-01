# Brain-Memory 演进记录

> 骨架地图 #4 — 演进维度（决策、债务、未来）
>
> 交叉引用：[模块总览](./Brain-Memory%20项目功能模块总览.md) | [数据流文档](./Brain-Memory 数据流通道梳理.md) | [API 契约](./Brain-Memory API契约与测试矩阵.md) | [边界与运行](./Brain-Memory 边界与运行.md)
>
> **注**：本项目已有丰富的历史留痕体系（`.devdocs/` 目录），本文件提供版本时间线总览和关键决策索引。详细内容请参阅对应留痕文件。

---

## 第一部分：版本时间线

```
v0.1.9  (2026-04-28)  ─── 起点版本，263 测试通过
  │
  ├─ v0.2.0  (2026-04-29)  ─── 第一个完整迭代闭环：摸底→规划→开发→质检→发布→复盘
  │    新增：健康检查 API · 结构化日志 · 统计指标 · CLI · 优雅降级 · 数据库迁移
  │
  ├─ v1.0.0  (2026-05-13)  ─── 核心架构完备 + 工程扎实
  │    8 类记忆体系 · 11 种边类型 · 6 种新增边 · Weibull 衰减 · Scope 隔离
  │    记忆注入格式 · 多 Agent 共享 · 遗忘曲线默认开启
  │    三级提取(T1启发式+T2 LLM+T3容错) · 启发式提取回退
  │
  ├─ v1.1.0  (2026-05-14)  ─── 存储解耦 + 增量图维护
  │    IStorageAdapter 接口 · SQLiteStorageAdapter · 增量 PageRank · 增量社区检测
  │
  ├─ v1.2.0  (2026-05-14)  ─── 开发者体验 + 质量打磨
  │    Hook 系统(6 类) · JSDoc 补全 · 测试覆盖率提升
  │
  ├─ v1.3.0  (2026-05-14)  ─── 探索 + 收尾
  │    LanceDB 语义索引 MVP · working-memory · session compressor
  │
  ├─ v1.4.0  (2026-05-15)  ─── 工程成熟度修复
  │    lint 收敛 · 类型安全 · any 类型策略
  │
  ├─ v1.5.0  (2026-05-15)  ─── Lite 模式 + 项目身份
  │    runMode: 'lite' · small 模式提示词 · 工程卫生脚本
  │
  ├─ v1.6.0  (2026-05-20)  ─── 工程夯实 + 性能起步
  │    查询缓存(A-1) · LanceDB 生产化(A-2) · 多级阶梯基准(A-3)
  │    Small 模式(B-1) · JSON 解析增强(B-2) · Lite 维护(B-3)
  │    依赖升级(C-1) · 覆盖补盲(C-2) · lint 收敛(C-3)
  │
  ├─ v1.6.2  (2026-05-21)  ─── 质量维护
  │
  ├─ v1.8.0  (2026-05-25)  ─── 工程清理 + 部署准备
  │    Ollama 原生端点 · 多 endpoint 思维护关闭 · maxTokens 配置
  │    LLM 健康检查 · 工程卫生清理 · 方法论更新
  │
  └─ v2.0.0  (2026-05-28)  ─── 六层 Scope + 认知金字塔审计闭环
       六层 scope (platform/workspace/agent/user/chat/thread)
       IStorageAdapter 统一 · Scope 迁移 v1→v2
       三路径召回(精确+泛化+语义) · 可组合维护管线(S-9)
       Web Control UI · Export/Import · 847/847 测试通过
         │
         └─ v2.1.0  当前版本 — 领域服务拆分
              ExtractionService / RecallService / MaintenanceService /
              HealthService / FusionService / ReflectionService / ReasoningService
```

### 关键版本跃迁

| 跃迁 | 核心变化 | 根因 |
|------|---------|------|
| v0.1.9 → v0.2.0 | 从"能用"到"可靠生产" | 无健康检查、无结构化日志、无测试残留清理 |
| v0.2.0 → v1.0.0 | 从"记忆系统"到"知识图谱" | 5种边→11种边，3 类→8 类记忆，无衰减模型 |
| v1.0.0 → v1.1.0 | 从"紧耦合 SQLite"到"存储抽象" | 换存储后端需要重写所有算法代码 |
| v1.6.0 → v2.0.0 | 从"三层 scope"到"六层 scope" | 多平台多 Agent 场景需要更细粒度隔离 |
| v2.0.0 → v2.1.0 | 从"上帝对象"到"领域服务" | ContextEngine 656 行 → 拆分为 7 个 ≤100 行 Service |

---

## 第二部分：关键架构决策

### ADR 索引（详见 `.devdocs/技术决策/`）

| 决策 | 日期 | 文件 | 影响 |
|------|------|------|------|
| **SQLite 为唯一 IStorageAdapter，LanceDB 降为 ISearchIndex** | 2026-05-28 | [LanceDB-回归-ISearchIndex](../技术决策/2026-05-28-LanceDB-回归-ISearchIndex.md) | 存储层单一化，避免双主存储的同步问题 |
| **ContextEngine 拆分为 7 个 Domain Service** | 2026-05-28 | [ContextEngine-拆分完成](../技术决策/2026-05-28-ContextEngine-拆分完成.md) | 每个 Service ≤100 行，遵循 SRP |
| **否决 vitest 4 升级** | 2026-05-20 | [vitest4-否决](../技术决策/2026-05-20-v1.6.0-vitest4-否决.md) | SQLite lock 不稳定性 4x 恶化，零收益 |
| **IStorageAdapter 接口设计** | 2026-05-14 | [F1-IStorageAdapter](../技术决策/2026-05-14-v1.1.0-F1-IStorageAdapter-接口设计.md) | ~40 方法接口，存储与算法解耦 |
| **any 类型收敛策略** | 2026-05-15 | [any-type-strategy](../技术决策/2026-05-15-any-type-strategy.md) | 107 处 any → 分层收敛 |
| **8 类记忆 + 6 种新增边** | 2026-05-05 | [A1-图Schema补全](../技术决策/2026-05-05-A1-图Schema补全调研.md) | 5→11 种边，覆盖全部 8 类记忆 |
| **三级提取(Tiered Extraction)** | 2026-05-05 | [A2-启发式提取](../技术决策/2026-05-05-A2-启发式提取调研.md) | LLM 不可用时自动降级，不回退空结果 |

---

## 第三部分：已知技术债务

> 从代码注释和留痕文档中提取

### 活跃债务

| 债务 | 位置 | 严重度 | 说明 |
|------|------|--------|------|
| `@deprecated scopeSession` | `types.ts` · `BmNode.scopeSession` · `NodeUpsertInput.scopeSession` | 低 | v2.0 后使用 `scopeChat` 替代，旧字段保留向后兼容 |
| `@deprecated LanceDBStorageAdapter` | `context.ts` | 低 | LanceDB 不再作为 IStorageAdapter 实现 |
| `@deprecated v1 scope 字段` | `adapter.ts` · `StorageFilter.includeScopes` | 低 | v2.0 后使用 `includeScopesV2` |
| **LPA 社区 ID 不稳定性** | `community.ts` · `ISSUE 7.2` | 中 | 节点删除/合并后同一主题组可能获得不同 ID，LPA 固有特性 |
| **PR 缓存 TTL 60s** | `pagerank.ts` · `CACHE_TTL` | 低 | 图结构缓存在高并发下可能过时 |
| **UI 无自动化测试** | `src/ui/` | 中 | 仅靠手动验证，回归风险 |
| **format/assemble.ts 无独立单元测试** | `format/assemble.ts` | 中 | Token 预算截断行为未验证 |
| **export/import 无专门测试** | `context.ts` | 中 | 导出/导入循环可能丢失数据 |

### 代码标记统计

```bash
# 运行以下命令获取实时状态：
grep -rn "@deprecated\|TODO\|FIXME\|HACK\|ISSUE" src/ --include="*.ts" | grep -v node_modules
```

---

## 第四部分：未来方向

> 从版本规划文档和代码注释中提取

### 已规划的后续版本

| 版本 | 方向 | 来源 |
|------|------|------|
| v2.x | LanceDB 语义索引生产化（多索引策略、增量更新） | [A-2 调研](../开发记录/2026-05-20-A2-LanceDB生产化.md) |
| v2.x | 增量语义索引更新 | [ISearchIndex spike](../技术决策/2026-05-25-isearch-index-spike.md) |
| v3.x | 多 Agent 记忆联邦（跨 Gateway 实例共享） | [B-2 调研](../技术决策/2026-05-06-B2-多Agent记忆共享调研.md) |

### 已否决的方向

| 方向 | 否决原因 | 文档 |
|------|---------|------|
| vitest 3→4 升级 | SQLite lock 恶化 4x | [vitest4 否决](../技术决策/2026-05-20-v1.6.0-vitest4-否决.md) |
| LanceDB 作为主存储 | 双主存储同步复杂度过高 | [LanceDB 回归 ISearchIndex](../技术决策/2026-05-28-LanceDB-回归-ISearchIndex.md) |

---

## 第五部分：经验沉淀

> 从版本复盘提取的可复用经验

| 经验 | 来源版本 | 类别 |
|------|---------|------|
| 摸底 → 可行性调查 → 版本规划 → 分批执行 → 质检 → 发布 → 留痕 → 复盘 | v0.2.0 | 方法论 |
| 启发式提取的合并策略：LLM 优先（高精度），启发式补充（高召回） | v1.0.0 A-2 | 算法 |
| LSH 桶比 O(n²) 去重高效 | v2.0.0 S-9 | 性能 |
| God Object 拆分应作为独立版本迭代，不混入功能变更 | v2.1.0 | 工程 |
| 测试用例数不总等于质量——B-5 声称 446 用例但实际仅 363 | v1.0.0 | 教训 |
| vitest config 遗漏导致部分测试不被识别 | v1.0.0 排查 | 教训 |

---

## 交叉引用

| 引用目标 | 链接 |
|---------|------|
| 完整版本节奏（每版的摸底/规划/开发/修复/复盘） | [.devdocs/INDEX.md](../INDEX.md) |
| 23 份 ADR 技术决策全文 | [.devdocs/技术决策/](../技术决策/) |
| 85+ 份开发记录 | [.devdocs/开发记录/](../开发记录/) |
| 各模块的设计决策 | [数据流文档 §关键设计决策](./Brain-Memory 数据流通道梳理.md) |
| 降级矩阵（与"不再回退空结果"决策对应） | [边界与运行 §降级行为矩阵](./Brain-Memory 边界与运行.md) |
