# IStorageAdapter + 动态数据边界的 `any` 类型收敛策略

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-15 |
| **状态** | Accepted |
| **决策人** | 代码助手（老板审核确认） |
| **相关版本** | v1.6.0（规划中） |

## 背景

ESLint `no-explicit-any` 报告 107 处 `any` 违规，分布于 16 个源文件，集中在 3 个架构边界：
1. **数据层** — SQLite/LanceDB 查询结果（`db.prepare().get()` 返回无类型）
2. **LLM/API 层** — `response.json() as any`，外部 API 响应无 schema
3. **Plugin 层** — `Message.content: any`、`getMemoryContext(): Promise<any>`

## 选项

| 选项 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A：全局 `unknown` + type guard | 所有 `any` 替换为 `unknown`，在消费点加类型守卫 | 最小改动，不破坏接口 | 调用方需大量类型守卫代码 |
| B：泛型接口 + Zod schema | 为 API 响应定义 Zod schema，SQL 查询用泛型包装 | 类型安全，运行时验证 | 引入 Zod 依赖，改动量大 |
| C：分层策略（推荐） | 每层用最合适的策略：数据层用 `Record<string, unknown>` + 窄接口，API 层用 `unknown` + 赋值断言，Plugin 层定义事件类型 | 改动适中，每层最优解 | 策略不统一 |

## 决策

**选项 C — 分层策略**。

### 数据层策略

```
IStorageAdapter 接口已定义 BmNode/BmEdge 等返回类型
  → 实现层（sqlite-adapter/lancedb-adapter）将查询结果 cast 为接口类型
  → 内部使用 `Record<string, unknown>` 保持查询灵活性
  → 对外接口不变
```

- `store.ts`：SQL 查询用 `Record<string, unknown>` 替代 `any`，赋值时 cast 到 `BmNode`
- `sqlite-adapter.ts / lancedb-adapter.ts`：同上
- `IStorageAdapter` 接口本身无需改动（已收敛）

### LLM/API 层策略

```
response.json() 返回 unknown
  → 定义 MinimalResponse 接口（{ choices?: ..., data?: ..., results?: ... }）
  → 使用类型守卫 + 默认值链式访问
```

- `llm.ts`：`response.json()` → 声明为 `unknown`，用 `as MinimalResponse` 收窄
- `embed.ts`：同上
- `extract.ts`：LLM 提取结果用结构化类型

### Plugin 层策略

```
定义 OpenClaw 事件类型，替代 any
  → Message.content: string（对话内容始终是文本）
  → getMemoryContext(): Promise<MemoryContextResult>
  → 事件 handler 签名收敛
```

## 影响

- **接口兼容**：IStorageAdapter 对外接口不变；Plugin 接口小幅收窄但不影响运行时
- **测试**：每批修复后必须全量测试通过
- **执行顺序**：数据层 → API 层 → Plugin 层（自底向上，依赖方向）
