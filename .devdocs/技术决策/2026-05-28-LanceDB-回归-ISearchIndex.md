# LanceDB 角色回归 ISearchIndex 伴随索引

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-28 |
| **状态** | 已采纳 |
| **决策人** | 杨晨（审核确认） |
| **关联版本** | v2.0.0 |
| **关联偏差** | D7 |

## 背景

### 设计构想

brain-memory 项目的存储架构设计构想中：

- **SQLite** = 真值源（True Store），存储所有节点、边、消息、社区摘要、向量。通过 `IStorageAdapter` 接口抽象。
- **LanceDB** = 伴随语义索引（Companion Semantic Index），仅存储 embedding → nodeId 映射。通过 `ISearchIndex` 接口接入。可随时从 SQLite 全量重建（`rebuild()` 方法）。

清晰的双层架构：SQLite 存真值，LanceDB 加速语义搜索。

### 实际代码状态（修复前）

```typescript
// src/store/lancedb-adapter.ts
export class LanceDBStorageAdapter implements IStorageAdapter {
  readonly capabilities = {
    communities: false,   // 不可用
    messages: false,      // 不可用
    reflections: false,   // 不可用
    vector: true,
    ftsSearch: false,
    graphTraversal: true,
  };
  // ... 40+ 方法实现（大部分为 stub）
}

// src/engine/context.ts 构造函数
if (config.storage === 'lancedb') {
  logger.warn('context', 'LanceDB backend selected — limited functionality...');
  this.storage = new LanceDBStorageAdapter(config.dbPath);
} else {
  this.storage = new SQLiteStorageAdapter(config.dbPath);
}
```

存在两个 `IStorageAdapter` 实现，用户可通过 `BmConfig.storage: 'lancedb'` 选择 LanceDB 作为独立存储后端，但会静默丢失社区检测、消息历史、反思功能。

### 正确的 LanceDB 使用路径

```typescript
// ISearchIndex 接口（src/store/search/index.ts）
export interface ISearchIndex {
  indexNode(node: BmNode, embedding: number[]): Promise<void>;
  indexNodes(items: Array<{ node: BmNode; embedding: number[] }>): Promise<void>;
  removeNode(nodeId: string): Promise<void>;
  semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]>;
  rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void>;
  count(): Promise<number>;
  close(): Promise<void>;
}

// Recaller 通过 ISearchIndex 使用 LanceDB
private async _getSemanticSeeds(query: string, limit: number, scopeFilter?: ScopeFilterV2): Promise<string[]> {
  if (!this.searchIndex || !this.embed) return [];
  const vec = await this.embed(query);
  const scored = await this.searchIndex.semanticSearch(vec, limit, scopeFilter);
  return scored.map(s => s.nodeId);
}
```

## 可选方案

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A: 补齐 LanceDBStorageAdapter | 实现 communities/messages/reflections 的完整 LanceDB 版本 | LanceDB 可独立运行，无需 SQLite | 维护双份存储逻辑，功能重复，偏离设计初衷。LanceDB 不适合做关系查询（图遍历、FTS5、CTE 递归） |
| B: 废弃 LanceDBStorageAdapter，LanceDB 仅通过 ISearchIndex 使用 | 标记 `@deprecated`，移除 ContextEngine 中的 LanceDB 分支 | 架构清晰，单一真相源（SQLite），LanceDB 专注于其擅长的语义搜索 | LanceDB POC 测试（lancedb-mvp/poc）保持跳过状态 |
| C: 将 LanceDBStorageAdapter 降级为 ISearchIndex 的实现 | 改为 `implements ISearchIndex` 并删除 IStorageAdapter 方法 | 接口正确 | 需要大幅重构 LanceDBStorageAdapter 内部实现，与当前架构无关 |

## 决策

**选择方案 B**。

### 具体操作

1. **`src/store/lancedb-adapter.ts`**：`LanceDBStorageAdapter` 类声明处添加 `@deprecated` JSDoc，保留文件供 POC 测试参考
2. **`src/store/adapter.ts`**：`IStorageAdapter` 接口文档更新：
   ```
   // 修改前：
   Implementations: SQLiteStorageAdapter (v1.1.0), LanceDBStorageAdapter (v1.3.0 POC).
   // 修改后：
   Implementations: SQLiteStorageAdapter (v1.1.0).
   @deprecated LanceDBStorageAdapter was a POC — LanceDB should be used via ISearchIndex as a companion semantic index.
   ```
3. **`src/engine/context.ts`**：
   ```typescript
   // 修改前：
   if (config.storage === 'lancedb') {
     logger.warn('context', 'LanceDB backend selected — limited functionality...');
     this.storage = new LanceDBStorageAdapter(config.dbPath);
   } else {
     this.storage = new SQLiteStorageAdapter(config.dbPath);
   }
   
   // 修改后：
   if (config.storage === 'lancedb') {
     logger.warn('context', 'LanceDB as standalone storage is deprecated. Using SQLite. LanceDB is still available via ISearchIndex — call engine.setSearchIndex().');
   }
   this.storage = new SQLiteStorageAdapter(config.dbPath);
   ```
4. **`src/store/lancedb-adapter.ts`**：移除 `import { LanceDBStorageAdapter }`（改为注释说明）

### 影响分析

- **API 兼容性**：`BmConfig.storage` 字段保留，`'lancedb'` 值仍可传入但不生效（输出 deprecation 警告），向后兼容
- **测试影响**：LanceDB POC 测试（`lancedb-mvp.test.ts` / `lancedb-poc.test.ts`）保持 `test.each.skip` 跳过状态
- **架构影响**：SQLite = 唯一 IStorageAdapter · LanceDB = ISearchIndex 伴随索引，边界清晰
- **D7 闭合**：认知金字塔审计偏差 D7 闭合

## 关联

- ADR：`2026-05-28-ContextEngine-拆分完成.md`（同一版本的另一个架构决策）
- 认知金字塔分析报告：偏差 D7
- 审核清单：D7（P1 通过）
