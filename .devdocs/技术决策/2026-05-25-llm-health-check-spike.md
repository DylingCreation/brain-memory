# LLM 启动健康检查 fire-and-forget — 技术调研

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **调研人** | OpenClaw CodingHelper |
| **调研目的** | 评估 LLM 启动健康检查的 fire-and-forget 实现方式，确定最佳方案 |
| **来源** | log/ P2-14: LLM 初始化缺少启动健康检查 |

---

## 一、背景

### 问题

brain-memory 的 `plugin/core.ts` 在 `init()` 中创建 `ContextEngine` 后即假定 LLM 可用。若 Ollama 未启动或模型未 pull，**第一次实际调用时才暴露**（30-60s 超时后报错）。用户重启 Gateway 看到 bootstrap 成功，误判一切正常，实际静默退化到 heuristic-only。

### 目标

`init()` 末尾发一个轻量 ping，**不阻塞** init 完成和后续消息处理：
- ✅ LLM 连通 → 静默通过
- ❌ LLM 不通 → 输出 warn 日志，让用户在启动日志中看到问题

### 踩过的坑（log/ 记录）

外部用户在部署中尝试过同步健康检查：
```typescript
// ❌ 错误: await 同步阻塞
async init() {
  this.engine = new ContextEngine(config);
  await this.engine.healthCheck(); // → init 不返回 → message_received 卡死
}
```

**教训**: 健康检查绝对不能 `await`。必须是 fire-and-forget。

---

## 二、方案对比

### 方案 A: `setTimeout` 延迟执行

```typescript
async init(): Promise<void> {
  this.engine = new ContextEngine(this.config);

  // fire-and-forget: 不阻塞 init 返回
  setTimeout(() => {
    this._pingLlm().catch(() => {});
  }, 0);
}

private async _pingLlm(): Promise<void> {
  const fn = createCompleteFn(this.config.llm);
  if (!fn) return; // 未配置 LLM，不是错误

  try {
    await fn('ping', 'ok');
  } catch {
    logger.warn('plugin', 'LLM connectivity check failed — extraction/reflection/fusion/reasoning will be skipped');
  }
}
```

| 维度 | 评估 |
|------|------|
| **实现复杂度** | 低 — 15 行 |
| **阻塞风险** | ✅ 零风险 — setTimeout 回调在 init 返回后执行 |
| **错误隔离** | ✅ catch 吃掉异常，不影响任何流程 |
| **取消机制** | ❌ 无 — 若 init 后立即 shutdown，回调仍会触发 |
| **Node 兼容** | ✅ setTimeout 通用 |

**评价**: 最简单、最安全。适合 MVP。

---

### 方案 B: `Promise` + 不 await

```typescript
async init(): Promise<void> {
  this.engine = new ContextEngine(this.config);

  // fire-and-forget: 创建但不 await
  const _healthPromise = (async () => {
    try {
      await this._pingLlm();
    } catch { /* ignore */ }
  })();
  // _healthPromise 不赋值给 this，GC 可能提前回收
}
```

| 维度 | 评估 |
|------|------|
| **实现复杂度** | 低 |
| **阻塞风险** | ✅ 零风险 |
| **错误隔离** | ✅ |
| **取消机制** | ⚠️ 无法取消 — Promise 无 abort |
| **Node 兼容** | ✅ |
| **GC 风险** | ⚠️ 未引用的 Promise 可能被 GC 提前回收（Node.js 不回收 pending Promise，但规范不保证） |

**评价**: 与方案 A 类似，但有微妙的 GC 不确定性。

---

### 方案 C: `AbortController` + 超时保护

```typescript
private _healthCheckAbort: AbortController | null = null;

async init(): Promise<void> {
  this.engine = new ContextEngine(this.config);
  this._startHealthCheck();
}

async shutdown(): Promise<void> {
  this._healthCheckAbort?.abort();
  this._healthCheckAbort = null;
  // ... shutdown engine
}

private _startHealthCheck(): void {
  this._healthCheckAbort = new AbortController();
  const { signal } = this._healthCheckAbort;

  setTimeout(async () => {
    if (signal.aborted) return;

    const fn = createCompleteFn(this.config.llm);
    if (!fn) return;

    try {
      // 3 秒超时保护: ping 请求不应耗时超过此值
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      await fn('ping', 'ok');
      clearTimeout(timeoutId);
    } catch {
      if (!signal.aborted) {
        logger.warn('plugin', 'LLM connectivity check failed');
      }
    }
  }, 500); // 500ms 延迟: 让 Gateway 启动日志先输出完
}
```

| 维度 | 评估 |
|------|------|
| **实现复杂度** | 中 — 30 行，需管理 AbortController |
| **阻塞风险** | ✅ 零风险 |
| **错误隔离** | ✅ |
| **取消机制** | ✅ `shutdown()` 可取消飞行中的检查 |
| **超时保护** | ✅ 3s 超时防止 ping 请求 hang |
| **Node 兼容** | ✅ Node ≥ 15 |

**评价**: 最完整。支持取消、超时保护、启动延迟。适合生产。

---

## 三、方案对比矩阵

| 维度 | A: setTimeout | B: Promise no await | C: AbortController |
|------|:---:|:---:|:---:|
| 实现复杂度 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 阻塞风险 | ✅ 零 | ✅ 零 | ✅ 零 |
| 取消机制 | ❌ | ❌ | ✅ |
| 超时保护 | ❌ | ❌ | ✅ |
| shutdown 安全 | ⚠️ | ⚠️ | ✅ |
| 生产就绪 | ⚠️ | ❌ | ✅ |
| 代码行数 | ~15 | ~12 | ~30 |

---

## 四、推荐方案

**推荐方案 C (AbortController + 超时保护)**，理由：

1. **shutdown 安全** — 若用户快速重启 Gateway，飞行中的健康检查不会在已关闭的 engine 上操作
2. **超时保护** — 防止 ping 请求无限期 hang（网络分区场景）
3. **延迟启动** — 500ms 延迟让 Gateway 启动日志先输出完，不干扰
4. **实现量小** — 仅 ~30 行，不影响 batch 进度

**备选**: 如果老板认为方案 C 过度设计，方案 A 作为 MVP 也完全可用（15 行，零风险）。

---

## 五、注入位置

```typescript
// src/plugin/core.ts — BrainMemoryPlugin.init()

async init(): Promise<void> {
  if (!this.config.enabled) {
    logger.info('plugin', 'Plugin disabled by configuration');
    return;
  }

  try {
    this.engine = new ContextEngine(this.config);
    logger.info('plugin', 'Plugin initialized successfully');

    // v1.8.0: fire-and-forget LLM connectivity check
    this._startHealthCheck();  // ← 不 await

  } catch (error) {
    logger.error('plugin', 'Failed to initialize:', error);
    throw error;
  }
}
```

**不在 `ContextEngine` 构造函数中**的原因：
- ContextEngine 是通用引擎，不应感知「健康检查汇报」这种运维逻辑
- 健康检查的 warn 日志属于插件层关注点
- Plugin 层持有 shutdown 的 AbortController，便于生命周期管理

---

## 六、待决策

| 决策点 | 选项 | 建议 |
|--------|------|------|
| 实现方案 | A (简单) / C (完整) | C — shutdown 安全性值得 15 行额外代码 |
| 延迟时间 | 0ms / 500ms / 1000ms | 500ms — 让 Gateway 日志先输出稳定 |
| ping 超时 | 3s / 5s / 10s | 3s — ping 应该 < 1s，3s 已足够宽容 |
| ping prompt | "ping" → "ok" / 真正调 healthCheck() | 真正调已存在的 `engine.healthCheck()` — 顺便验证 LLM+Embedding 两端 |

---

## 七、ping 内容选择

| ping 方式 | 优点 | 缺点 |
|-----------|------|------|
| `llm('ping', 'ok')` | 最轻量 (~5 token) | 只验证 LLM，不验证 Embedding |
| `engine.healthCheck()` | 同时验证 LLM + Embedding + DB | 如果有 Embedding API 调用，可能产生费用 |

**建议**: 先 ping LLM（`llm('ping', 'ok')`）。Embedding 的连通性在首次实际调用时验证。如果老板要求全组件，扩展为 `engine.healthCheck()`。

---

*调研依据: log/ 外部部署反馈 (P2-14 + 阻塞 2) + 当前 src/plugin/core.ts 代码分析 + Node.js 异步模型*
