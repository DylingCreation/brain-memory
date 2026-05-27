# B-4 Reranker & Admission Control 配置类型补全 — 开发记录

| 字段 | 内容 |
|------|------|
| **留痕类型** | 开发记录 |
| **留痕日期** | 2026-05-07 |
| **记录人** | 代码助手（CodingHelper） |
| **关联版本** | v1.0.0 批次 2 |
| **对应规划** | B-4 集成 retriever/ 6 文件 |
| **对应步骤** | B-4 第 2 步：修 P-1 —— 补 admission 配置类型 |

---

## 一、问题背景

B-4 阶段留痕（2026-05-06 阶段汇报）确认 Reranker 和 Admission Control 的代码接入已完成，但存在 3 个问题：

| 编号 | 问题 | 严重程度 |
|------|------|---------|
| **P-1** | `admission` 配置未定义于 `BmConfig` 接口，使用 `(config as any).admission` 类型逃逸 | 中 |
| **P-2** | Reranker 的 cosine 降级路径 `queryVec` 传空数组 `[]` | 低 |
| **P-3** | 缺少端到端集成测试 | 中 |

本步骤解决 **P-1**。

---

## 二、修改内容

### 2.1 `src/types.ts` — 新增 AdmissionConfig 类型 + BmConfig 字段 + 默认值

**新增 AdmissionConfig 接口**（置于 RerankConfig 之后、ReflectionConfig 之前）：

```typescript
export interface AdmissionConfig {
  enabled: boolean;
  duplicateThreshold: number;
  minContentLength: number;
  typePriors: Record<string, number>;
}

export const DEFAULT_ADMISSION_CONFIG: AdmissionConfig = {
  enabled: false,
  duplicateThreshold: 0.85,
  minContentLength: 10,
  typePriors: {
    profile: 0.95, preferences: 0.9, entities: 0.75, events: 0.45,
    tasks: 0.8, skills: 0.85, cases: 0.8, patterns: 0.85,
  },
};
```

**BmConfig 接口新增字段**：

```typescript
/** 门控准入配置（v1.0.0 B-4） */
admission?: AdmissionConfig;
```

**DEFAULT_CONFIG 新增默认值**：

```typescript
admission: DEFAULT_ADMISSION_CONFIG,
```

### 2.2 `src/retriever/admission-control.ts` — 改为从 types.ts 导入

| 改动 | 说明 |
|------|------|
| 移除本地 `AdmissionConfig` 接口定义 | 改为 `import type { AdmissionConfig } from "../types"` |
| 移除本地 `DEFAULT_ADMISSION_CONFIG` 常量 | 改为 `import { DEFAULT_ADMISSION_CONFIG } from "../types"` |
| 新增 re-export | `export { AdmissionConfig, DEFAULT_ADMISSION_CONFIG } from "../types"`（向后兼容测试文件的 import 路径） |

### 2.3 `src/engine/context.ts` — 消除类型逃逸

| 改动 | 说明 |
|------|------|
| 修改 import | `DEFAULT_ADMISSION_CONFIG` 改为从 `../types` 导入 |
| 消除 `(config as any)` | `config.admission || DEFAULT_ADMISSION_CONFIG`（类型安全） |

---

## 三、测试

| 指标 | 改进前 | 改进后 |
|------|--------|--------|
| 测试文件 | 36 passed | **36 passed** |
| 测试用例 | 330 passed / 6 skipped / 0 failed | **330 passed / 6 skipped / 0 failed** |
| 回归 | — | ✅ **零回归** |
| 类型检查 | — | ✅ tsc --noEmit 零报错 |
| `any` 逃逸 | 1 处 `(config as any).admission` | **0 处** |

**admission-control.test.ts（6 用例）**：✅ 全部通过
**admission-control-enhanced.test.ts（6 用例）**：✅ 全部通过

---

## 四、验收确认

| 验收标准 | 状态 |
|---------|------|
| `BmConfig` 接口包含 `admission` 字段 | ✅ |
| `DEFAULT_CONFIG` 包含 admission 默认值 | ✅ |
| `(config as any)` 类型逃逸消除 | ✅ |
| admission-control.ts 兼容旧 import 路径 | ✅ re-export 保障 |
| 测试无回归 | ✅ 330 passed / 0 failed |
| TypeScript 类型安全 | ✅ tsc --noEmit 零报错 |

---

## 五、向后兼容性

- **re-export 保障**：`admission-control.ts` 仍然导出 `AdmissionConfig` 和 `DEFAULT_ADMISSION_CONFIG`，现有测试文件的 import 路径无需修改
- **默认值 `enabled: false`**：行为与修改前一致（门控默认关闭），无行为变更
- **BmConfig 新增可选字段 `admission?`**：不影响已有配置对象

---

## 六、后续步骤

- **第 3 步**：修 P-2 —— Reranker cosine 降级路径 queryVec 传空数组的问题（低优先级，可选）
- **第 4 步**：补集成测试 + 留痕收尾

---

*开发完成 · 2026-05-07 11:24*
