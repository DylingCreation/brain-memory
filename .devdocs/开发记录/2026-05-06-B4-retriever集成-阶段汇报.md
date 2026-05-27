# B-4 集成 retriever/ 6 文件 — 阶段汇报（工作中断留痕）

| 字段 | 内容 |
|------|------|
| **留痕类型** | 开发记录（工作中断） |
| **留痕日期** | 2026-05-06 |
| **记录人** | 代码助手（CodingHelper） |
| **关联版本** | v1.0.0 批次 2 |
| **对应规划** | B-4 集成 retriever/ 6 个半成品文件 |

---

## 一、当前完成状态

### ✅ 已完成接入（2/6 模块）

| 模块 | 文件 | 接入位置 | 状态 |
|------|------|---------|------|
| **Intent Analyzer** | `src/retriever/intent-analyzer.ts` | `src/recaller/recall.ts` recall() 方法开头，分析查询意图并输出 debug 日志 | ✅ 已接入 |
| **Query Expander** | `src/retriever/query-expander.ts` | `src/recaller/recall.ts` recall() 方法中，精确路径种子获取使用 expandedQuery | ✅ 已接入 |

### ✅ 已确认已有集成（2/6 模块）

| 模块 | 文件 | 现状 |
|------|------|------|
| **Vector Recall** | `src/retriever/vector-recall.ts` | 已被 HybridRecaller 内部使用，无需额外接入 |
| **Hybrid Recall** | `src/retriever/hybrid-recall.ts` | 已被 ContextEngine 通过 engine="hybrid" 模式调用，无需额外接入 |

### ❌ 尚未接入（2/6 模块）

| 模块 | 文件 | 计划接入位置 | 状态 |
|------|------|-------------|------|
| **Reranker** | `src/retriever/reranker.ts` | ContextEngine.recall() 召回结果后处理，按 rerank 配置可选启用 | ❌ 未开始 |
| **Admission Control** | `src/retriever/admission-control.ts` | ContextEngine.processTurn() 节点写入前门控，按配置可选启用 | ❌ 未开始 |

---

## 二、各模块功能摘要

### 2.1 Intent Analyzer（已接入）
- 5 类意图分类：technical / preference / factual / task / general
- 10 条正则规则，覆盖中英双语
- 返回 intent + 各维度 scores
- **接入方式**：recall() 开头调用，输出 debug 日志，当前未改变召回策略

### 2.2 Query Expander（已接入）
- 14 组中英双语同义词映射
- 检测到关键词时最多扩展 5 个同义词
- **接入方式**：recall() 中精确路径种子获取使用 expandedQuery，泛化路径仍用原始 query

### 2.3 Vector Recall（已有）
- 纯向量 + FTS5 双路召回，RRF 融合
- 集成 intent-analyzer + query-expander
- **使用方**：HybridRecaller 内部调用

### 2.4 Hybrid Recall（已有）
- Graph + Vector 双引擎并行召回，Min-Max 归一化 + RRF 融合
- 重叠节点加分（graphScore + vectorScore），单源节点打 0.8 折扣
- **使用方**：ContextEngine.recallHybrid()（当 engine="hybrid" 时）

### 2.5 Reranker（待接入）
- Cross-encoder 重排序，支持 Jina / SiliconFlow / Voyage / DashScope / TEI / Pinecone
- 降级方案：cosine 相似度
- 配置：`BmConfig.rerank`（enabled/apiKey/model/endpoint/provider/topK/timeoutMs）
- **计划接入**：ContextEngine.recall() 召回后，rerank.enabled 时对结果重排序

### 2.6 Admission Control（待接入）
- 轻量门控：评估候选记忆写入前质量
- 检查项：最小内容长度、类型先验、内容去重（Jaccard）、向量去重
- 配置：AdmissionConfig（enabled/duplicateThreshold/minContentLength/typePriors）
- **计划接入**：ContextEngine.processTurn() 节点 upsert 前，admission.enabled 时调用 evaluate()

---

## 三、测试现状

| 测试文件 | 覆盖模块 | 用例数 | 状态 |
|---------|---------|--------|------|
| `test/intent-analyzer.test.ts` | Intent Analyzer | 7 passed | ✅ 已有 |
| `test/query-expander.test.ts` | Query Expander | 6 passed | ✅ 已有 |
| `test/reranker.test.ts` | Reranker | 5 passed | ✅ 已有 |
| `test/admission-control.test.ts` | Admission Control | 7 passed | ✅ 已有 |
| `test/hybrid-recall.test.ts` | Hybrid Recall | 已有 | ✅ 已有 |
| `test/vector-recall.test.ts` | Vector Recall | 已有 | ✅ 已有 |
| **集成测试** | 接入主流程后的端到端验证 | 0 | ❌ 需补充 |

---

## 四、后续任务清单

| 编号 | 任务 | 预估工时 | 说明 |
|------|------|---------|------|
| B-4-1 | Reranker 接入 ContextEngine.recall() | 0.5 天 | 按 rerank.enabled 可选启用 |
| B-4-2 | Admission Control 接入 processTurn() | 0.5 天 | 按 admission.enabled 可选启用 |
| B-4-3 | 补充集成测试（端到端验证） | 0.5 天 | 验证接入后主流程正常 |
| B-4-4 | 全量回归测试 + 性能对比 | 0.25 天 | 确认无退化 |
| B-4-5 | 留痕文档完善 | 0.25 天 | 补充本记录的后续部分 |

---

## 五、关键代码位置

| 模块 | 需修改文件 | 具体位置 |
|------|-----------|---------|
| Reranker 接入 | `src/engine/context.ts` | recall() 方法末尾，返回前调用 reranker.rerank() |
| Admission 接入 | `src/engine/context.ts` | processTurn() 中 upsertNode 前调用 admission.evaluate() |
| 新类型 | `src/types.ts` | 可能需要新增 admission 配置接口 |

---

## 六、中断原因

开发过程中出现工具调用循环（反复读取同一文件、尝试重复编辑），被老板发现并中断。已停止循环，当前进度如实记录。

---

*阶段留痕 · 2026-05-06 12:17 · 新会话继续执行*
