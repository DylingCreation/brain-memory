# F-10 LLM 启动健康检查 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-10 |
| **前置调研** | `.devdocs/技术决策/2026-05-25-llm-health-check-spike.md`（方案 C） |

## 一、开发内容

**涉及文件**: `src/plugin/core.ts` (+49 行)

**实现方案**: 方案 C — AbortController + 超时保护

```typescript
// 类字段
private _healthCheckAbort: AbortController | null = null;

// init() 末尾
this._startHealthCheck();  // fire-and-forget, 不 await

// shutdown() 开头
this._healthCheckAbort?.abort();

// 私有方法
private _startHealthCheck(): void {
  this._healthCheckAbort = new AbortController();
  const { signal } = this._healthCheckAbort;

  setTimeout(async () => {
    if (signal.aborted) return;

    const fn = createCompleteFn(this.config.llm);
    if (!fn) return;  // LLM 未配置 — 非错误

    const timeoutId = setTimeout(() => this._healthCheckAbort!.abort(), 3000);

    try {
      await fn('ping', 'ok');
      clearTimeout(timeoutId);
    } catch {
      if (!signal.aborted) {
        logger.warn('plugin', 'LLM connectivity check failed...');
      }
    }
  }, 1000);
}
```

**设计要点**:
| 参数 | 值 | 理由 |
|------|-----|------|
| 延迟 | 1000ms | 老板审阅: 500→1000，确保 Gateway 启动日志先输出 |
| 超时 | 3000ms | ping 请求正常 < 1s，3s 足够宽容 |
| ping prompt | `'ping'` → `'ok'` | ~5 token，零副作用 |

## 二、测试

| 验证项 | 结果 |
|--------|------|
| `npm run build` | ✅ |
| `strictNullChecks` | ✅ |
| `npm test` | ✅ 0 回归 |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| fire-and-forget，不阻塞 init() | ✅ |
| shutdown() 可取消飞行中的检查 | ✅ |
| LLM 不通时 warn 日志 | ✅ |
| LLM 通时静默 | ✅ |
| 延迟 1000ms | ✅ |
| 3s 超时保护 | ✅ |
