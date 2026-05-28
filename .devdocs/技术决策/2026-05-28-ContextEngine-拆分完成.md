# ContextEngine 领域服务拆分完成（从 4 到 7 服务）

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-28 |
| **状态** | 已采纳 |
| **决策人** | 杨晨（审核确认） |
| **关联版本** | v2.0.0 |
| **关联偏差** | D2 / D3 / D4 |
| **关联改进** | I1 |

## 背景

### v2.1.0 状态

v2.1.0 已将 ContextEngine 拆分为 4 个领域服务：

| 服务 | 职责 |
|------|------|
| `ExtractionService` | 对话轮次处理：提取 → upsert → embed → 轮次反思 → 工作记忆 |
| `RecallService` | 查询召回：scope filter 构造 → 双 pass 召回 → hook 生命周期 |
| `MaintenanceService` | 图维护：dedup → PageRank → community detection → decay archiving |
| `HealthService` | 健康检查、统计查询、存储适配器访问 |

但 Fusion / Reflection / Reasoning 三个功能仍作为 `ContextEngine` 的直接方法实现，内联调用 `fusion/analyzer`、`reflection/extractor`、`reasoning/engine` 中的纯函数。

```typescript
// 修复前 — ContextEngine 直接调用纯函数（~60 行/方法）
async performFusion(sessionId: string = 'fusion'): Promise<FusionResult> {
  if ((this.config.mode ?? 'full') === 'lite' || !this.config.fusion.enabled) return { ... };
  try {
    for (const hook of this.hooks.beforeFusion) { ... }
    const result = await runFusion(this.storage, this.config, ...);  // 直接调用纯函数
    for (const hook of this.hooks.afterFusion) { ... }
    return result;
  } catch (error) { ... throw new Error(`Fusion failed: ...`); }
}
// reflectOnSession / performReasoning 结构类似
```

这导致：
- ContextEngine 行数 ~450（含 3 个 ~60 行方法 = ~180 行冗余）
- 与 Extraction/Recall 等服务化模块风格不一致
- **偏差 D2**：Fusion/Reflection/Reasoning 无独立领域服务
- **偏差 D3/D4**：控制层与算法层边界模糊，ContextEngine 直接调用 `fusion/analyzer`、`reflection/extractor`、`reasoning/engine` 中的纯函数

## 可选方案

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A: 保持现状 | 不做任何修改 | 零改动风险 | D2/D3/D4 不闭合，架构不统一 |
| B: 创建 3 个轻量 Service wrapper | 参照 ExtractionService 模式，封装前置检查 + 纯函数调用 + 错误处理 | 架构统一，改动小（每个 Service 40-55 行），ContextEngine 显著瘦身 | 多 3 个文件 |
| C: 将纯函数调用内联到更薄的 ContextEngine | 减少文件数 | ContextEngine 重新变胖，退回 God Object 方向 |

## 决策

**选择方案 B**。参照 `ExtractionService` 的模式——但更轻量（Fusion/Reflection/Reasoning 没有复杂的多步骤管线，主要是前置检查 + 纯函数调用）。

### 三个新服务

**FusionService**（`src/engine/fusion-service.ts`，55 行）：
```typescript
export class FusionService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private hooks: HookRegistry,
    private llmEnabled: boolean,
  ) {}

  async run(sessionId: string = 'fusion'): Promise<FusionResult> {
    // 前置检查：mode !== lite && fusion.enabled
    // beforeFusion hooks
    // await runFusion(storage, config, llm, embedFn, sessionId)
    // afterFusion hooks
    // 错误处理 + 日志
  }
}
```

**ReflectionService**（`src/engine/reflection-service.ts`，55 行）：
```typescript
export class ReflectionService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private llmEnabled: boolean,
  ) {}

  async run(sessionId: string, messages: Array<{ role?: string; content: string }>): Promise<ReflectionInsight[]> {
    // 前置检查：mode !== lite && reflection.enabled && sessionReflection && llmEnabled && storage.capabilities.reflections
    // 过滤 sessionNodes
    // await reflectOnSession(reflectionConfig, llm, params, mode)
    // 错误处理 + 日志
  }
}
```

**ReasoningService**（`src/engine/reasoning-service.ts`，42 行）：
```typescript
export class ReasoningService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private llmEnabled: boolean,
  ) {}

  async run(query?: string): Promise<ReasoningConclusion[]> {
    // 前置检查：mode !== lite && reasoning.enabled && llmEnabled
    // const nodes = storage.findAllActive()
    // const edges = storage.findAllEdges()
    // await runReasoning(llm, nodes, edges, query, config)
    // 错误处理 + 日志
  }
}
```

### ContextEngine 委托

```typescript
// 新增私有字段
private fusionService: FusionService;
private reflectionService: ReflectionService;
private reasoningService: ReasoningService;

// 构造函数初始化
this.fusionService = new FusionService(this.storage, config, this.hooks, this.llmEnabled);
this.reflectionService = new ReflectionService(this.storage, config, this.llmEnabled);
this.reasoningService = new ReasoningService(this.storage, config, this.llmEnabled);

// 公开方法 — 每方法 1 行委托
async performFusion(sessionId = 'fusion') { return this.fusionService.run(sessionId); }
async reflectOnSession(sessionId, messages) { return this.reflectionService.run(sessionId, messages); }
async performReasoning(query?) { return this.reasoningService.run(query); }
```

### 对比

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| ContextEngine 行数 | ~450 | **~350** |
| 领域服务数 | 4 | **7** |
| 纯函数直接调用 | `runFusion()` / `reflectOnSession()` / `runReasoning()` | **0** |
| 公开 API | 不变 | 不变 |
| D2/D3/D4 偏差 | 未闭合 | **闭合** |

## 影响

- **文件变更**：3 个新文件 + `src/engine/context.ts` 修改
- **API 兼容性**：`ContextEngine.performFusion()` / `reflectOnSession()` / `performReasoning()` 公开方法签名不变，返回值不变
- **测试影响**：现有测试无需修改（API 兼容），继续通过
- **D3/D4 闭合验证**：`grep "runFusion\|runReasoning" src/engine/context.ts` → 无匹配（证明 ContextEngine 不再直接调用纯函数）

## 关联

- ADR：`2026-05-28-LanceDB-回归-ISearchIndex.md`（同一版本的另一个架构决策）
- 认知金字塔分析报告：偏差 D2/D3/D4，改进 I1
- 审核清单：D2（P1 通过）、D3/D4（P1 有条件通过 → 验证通过）、I1（P2 通过）
