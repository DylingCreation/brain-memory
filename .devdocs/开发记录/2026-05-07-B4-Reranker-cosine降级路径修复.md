# B-4 Reranker cosine 降级路径修复 — 开发记录

| 字段 | 内容 |
|------|------|
| **留痕类型** | 开发记录 |
| **留痕日期** | 2026-05-07 |
| **记录人** | 代码助手（CodingHelper） |
| **关联版本** | v1.0.0 批次 2 |
| **对应规划** | B-4 集成 retriever/ 6 文件 |
| **对应步骤** | B-4 第 3 步：修 P-2 —— Reranker queryVec 传空数组 |

---

## 一、问题背景

### P-2 根因分析

`context.ts` 中调用 Reranker 的代码：

```typescript
// 旧代码 — 传入空数组作为 queryVec
const rerankResult = await this.reranker.rerank(query, [], result.nodes, embedFn);
```

而 `rerankWithCosine` 中的守卫条件：

```typescript
if (embedFn && queryVec.length > 0) {
  // 计算余弦相似度
}
```

**结果**：当 reranker API 不可用时，cosine 降级路径因为 `queryVec.length === 0` 直接跳过计算，所有节点得分均为 0，排序不变——降级等同于「不排序」。

### 根因

设计时假设调用方会提供 `queryVec`，但 `recall()` 方法内部没有现成的 queryVec（Recaller 内部的 embed 调用是私有方法，不返回向量给上层）。

---

## 二、修复方案

**核心思路**：Reranker 的 cosine 降级路径自己计算 query vector，不再依赖调用方传入。

### 2.1 修改 `src/retriever/reranker.ts`

**签名变更**：

```typescript
// 旧签名（4 参数）
async rerank(query: string, queryVec: number[], nodes: BmNode[], embedFn?: EmbedFn | null)

// 新签名（3 参数）
async rerank(query: string, nodes: BmNode[], embedFn?: EmbedFn | null)
```

**cosine 降级路径重构**：

```typescript
private async rerankWithCosine(query: string, nodes: BmNode[], embedFn?: EmbedFn | null): Promise<RerankResult> {
  const scores = new Map<string, number>();

  if (!embedFn) {
    return { nodes, rerankScores: scores, apiUsed: false };
  }

  // 按需计算 query vector
  let queryVec: number[] = [];
  try {
    queryVec = await embedFn(query);
  } catch {
    return { nodes, rerankScores: scores, apiUsed: false };
  }

  if (queryVec.length === 0) {
    return { nodes, rerankScores: scores, apiUsed: false };
  }

  for (const node of nodes) {
    // 计算每个节点向量，计算余弦相似度
  }
}
```

### 2.2 修改 `src/engine/context.ts`

```typescript
// 旧调用
const rerankResult = await this.reranker.rerank(query, [], result.nodes, embedFn);

// 新调用
const rerankResult = await this.reranker.rerank(query, result.nodes, embedFn);
```

### 2.3 修改 `test/reranker.test.ts`

同步更新 2 处测试调用，去掉 `queryVec` 参数。

---

## 三、修改文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/retriever/reranker.ts` | 签名变更 + cosine 路径重构 | 2 处编辑 |
| `src/engine/context.ts` | 调用参数去掉空数组 | 1 处编辑 |
| `test/reranker.test.ts` | 测试调用同步更新 | 2 处编辑 |

---

## 四、测试

| 指标 | 改进前 | 改进后 |
|------|--------|--------|
| 测试文件 | 36 passed | **36 passed** |
| 测试用例 | 330 passed / 6 skipped / 0 failed | **330 passed / 6 skipped / 0 failed** |
| 回归 | — | ✅ **零回归** |
| 类型检查 | — | ✅ tsc --noEmit 零报错 |

---

## 五、验收确认

| 验收标准 | 状态 |
|---------|------|
| cosine 降级路径在有 embedFn 时正常计算相似度 | ✅ query vector 由 reranker 自身计算 |
| embedFn 不可用时优雅返回原顺序 | ✅ 显式检查 |
| API rerank 路径不受影响 | ✅ rerankWithApi 未改动 |
| 测试无回归 | ✅ 330 passed / 0 failed |
| TypeScript 类型安全 | ✅ tsc --noEmit 零报错 |

---

## 六、向后兼容性

- **签名变更**：`rerank()` 从 4 参数变为 3 参数，移除了 `queryVec`。外部如有直接调用 Reranker 的代码需要同步更新（当前无外部调用，仅 context.ts 和测试文件）。
- **行为增强**：cosine 降级路径从「不生效」变为「正常计算相似度」，属于功能修复。
- **性能注意**：cosine 降级时会额外调用 1 次 embedFn 计算 query vector + N 次计算节点向量。API rerank 路径不受影响。

---

*开发完成 · 2026-05-07 11:33*
