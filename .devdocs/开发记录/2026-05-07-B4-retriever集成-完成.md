# B-4 集成 retriever/ 6 文件 — 完整开发记录

| 字段 | 内容 |
|------|------|
| **留痕类型** | 开发记录 |
| **留痕日期** | 2026-05-07 |
| **记录人** | 代码助手（CodingHelper） |
| **关联版本** | v1.0.0 批次 2 |
| **对应规划** | B-4 集成 retriever/ 6 个半成品文件 |
| **前置阶段留痕** | `.devdocs/开发记录/2026-05-06-B4-retriever集成-阶段汇报.md`（旧会话中断留痕） |

---

## 一、模块接入全景

### 6 模块最终状态

| 模块 | 文件 | 接入位置 | 状态 |
|------|------|---------|------|
| **Intent Analyzer** | `src/retriever/intent-analyzer.ts` | `src/recaller/recall.ts` recall() 开头 | ✅ 已接入（旧会话） |
| **Query Expander** | `src/retriever/query-expander.ts` | `src/recaller/recall.ts` recall() 精确路径种子 | ✅ 已接入（旧会话） |
| **Vector Recall** | `src/retriever/vector-recall.ts` | HybridRecaller 内部使用 | ✅ 已有 |
| **Hybrid Recall** | `src/retriever/hybrid-recall.ts` | ContextEngine engine="hybrid" 时调用 | ✅ 已有 |
| **Reranker** | `src/retriever/reranker.ts` | `src/engine/context.ts` recall() 末尾 | ✅ 已接入 + 修复 |
| **Admission Control** | `src/retriever/admission-control.ts` | `src/engine/context.ts` processTurn() upsert 前 | ✅ 已接入 + 修复 |

---

## 二、本会话完成的工作

### 2.1 第 1 步：接入点分析

详见 `.devdocs/开发记录/2026-05-07-B4-接入点分析.md`

核心发现：代码接入已在旧会话 commit `c196ec7` 中完成，但存在 3 个问题：
- P-1：admission 配置类型逃逸
- P-2：Reranker cosine 降级路径 queryVec 空数组
- P-3：缺少集成测试

### 2.2 第 2 步：修 P-1 —— 补 admission 配置类型

详见 `.devdocs/开发记录/2026-05-07-B4-Reranker-Admission配置类型补全.md`

| 修改 | 文件 | 说明 |
|------|------|------|
| 新增 `AdmissionConfig` 接口 + 默认值 | `src/types.ts` | 类型安全定义 |
| `BmConfig` 新增 `admission?: AdmissionConfig` | `src/types.ts` | 可选字段 |
| `DEFAULT_CONFIG` 新增 admission 默认值 | `src/types.ts` | enabled: false |
| admission-control.ts 改为从 types.ts 导入 | `src/retriever/admission-control.ts` | 加 re-export 兼容旧路径 |
| 消除 `(config as any)` | `src/engine/context.ts` | 类型安全 |

### 2.3 第 3 步：修 P-2 —— Reranker cosine 降级路径修复

详见 `.devdocs/开发记录/2026-05-07-B4-Reranker-cosine降级路径修复.md`

| 修改 | 文件 | 说明 |
|------|------|------|
| `rerank()` 签名从 4 参数变为 3 参数 | `src/retriever/reranker.ts` | 移除 queryVec 参数 |
| cosine 降级路径自计算 query vector | `src/retriever/reranker.ts` | `await embedFn(query)` |
| 调用点更新 | `src/engine/context.ts` | 去掉空数组参数 |
| 测试同步更新 | `test/reranker.test.ts` | 2 处调用更新 |

### 2.4 第 4 步：集成测试 + 留痕收尾

#### 新增集成测试文件

`test/b4-retriever-integration.test.ts` — 5 个测试用例：

| # | 测试用例 | 验证内容 | 结果 |
|---|---------|---------|------|
| 1 | recall + rerank enabled 无 API key | cosine 降级路径不崩溃 | ✅ passed |
| 2 | recall + rerank enabled 无 embedding | 优雅降级不崩溃 | ✅ passed |
| 3 | processTurn 无 LLM + admission 默认关闭 | 启发式提取 + 主流程正常 | ✅ passed |
| 4 | processTurn + admission 显式开启 | 门控不崩溃主流程 | ✅ passed |
| 5 | processTurn + admission 高 minContentLength | 短内容被拒绝 | ✅ passed |

#### 全量回归

| 指标 | B-4 前 | B-4 后 | 变化 |
|------|--------|--------|------|
| 测试文件 | 36 passed | **37 passed** | +1 文件 |
| 测试用例 | 330 passed / 6 skipped | **335 passed / 6 skipped** | +5 用例 |
| 失败 | 0 | **0** | ✅ |
| tsc | 零报错 | **零报错** | ✅ |

---

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| Intent Analyzer 接入 recall() | ✅ 已接入（旧会话） |
| Query Expander 接入 recall() | ✅ 已接入（旧会话） |
| Vector Recall 已有 | ✅ 无需额外接入 |
| Hybrid Recall 已有 | ✅ 无需额外接入 |
| Reranker 可选启用 | ✅ 按 `config.rerank.enabled` 控制 |
| Reranker API 降级可用 | ✅ cosine 路径自计算 query vector |
| Admission Control 可选启用 | ✅ 按 `config.admission.enabled` 控制 |
| Admission 配置类型安全 | ✅ BmConfig 已定义 |
| 集成测试覆盖 | ✅ 5 个端到端测试 |
| 测试无回归 | ✅ 335 passed / 0 failed |
| 构建通过 | ✅ tsc --noEmit 零报错 |

---

## 四、向后兼容性

| 检查项 | 评估 |
|--------|------|
| Reranker 签名变更 | `rerank()` 从 4 参数变为 3 参数，移除 queryVec。当前仅 context.ts 和测试文件调用，无外部依赖 |
| admission 配置新增 | `BmConfig` 新增可选字段 `admission?`，不影响已有配置对象 |
| 默认行为不变 | admission 默认 `enabled: false`，rerank 默认 `enabled: false`，行为与修改前一致 |
| admission-control.ts re-export | 保留 `AdmissionConfig` 和 `DEFAULT_ADMISSION_CONFIG` 的导出，兼容旧 import 路径 |

---

## 五、后续扩展

1. **集成测试增强**：当前集成测试覆盖无 LLM 场景，后续可在有 LLM 环境中补真实场景测试
2. **Reranker API 实测**：配置真实 Reranker API Key 后验证 cross-encoder 路径
3. **Admission 去重效果量化**：在真实使用中统计 admission 拒绝率和拒绝原因分布
4. **性能基准**：B-4 接入后测量 recall 全链路耗时（C-7 任务）

---

*开发完成 · 2026-05-07 11:38*
