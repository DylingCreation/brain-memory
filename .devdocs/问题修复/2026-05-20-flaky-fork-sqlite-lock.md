# 测试并行 fork SQLite lock flaky — 问题记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-20 |
| **记录人** | 代码助手 |
| **关联版本** | v1.6.0（发现）/ v0.2.0 B-1（已知根源） |

## 问题描述

全量测试 `vitest run`（`pool: forks, maxForks=4`）在多进程并行执行时，SQLite 同一时刻只能有一个写入者。多个 fork 进程同时操作 SQLite 文件时，随机触发 `SQLITE_BUSY`，命中任何进程中的任何测试，导致测试随机失败。

## 影响的测试（2026-05-20 全天观察）

**SQLite 锁竞争类**（随机命中，单跑全通过）：
- `integration.test.ts` → extractor parse pipeline
- `admission-control-enhanced.test.ts` → handle disabled admission control
- `admission-control-enhanced.test.ts` → handle very short content
- `coverage-batch2.test.ts` → returns false when not enough nodes
- `graph.test.ts` → cache invalidation works
- `vector-recall.test.ts` → returns empty for empty DB
- `incremental-maintenance.test.ts` → returns false when no dirty nodes

**性能浮动类**（fork 进程调度变化 → 耗时波动）：
- `performance-incremental.test.ts` → 增量 PageRank/LPA 耗时
- `perf-1k-benchmark.test.ts` → 增量 PageRank ≥ 5x / LPA ≥ 3x

## 不稳定性统计

| vitest 版本 | 不稳定率 | 失败数 |
|------------|---------|--------|
| 3.2.4 (maxForks=4) | ~20-40% | 1-4 |
| 4.1.6 (maxForks=4) | ~80%+ | 2-5 |

## 根因

- `better-sqlite3` 是同步 C++ 绑定，一个进程内单连接，但多个 fork 进程各自有独立连接
- SQLite 同一时刻只能有一个写入者（WAL 模式下可并发读，但 write 是排他的）
- `maxForks > 1` 时，多进程同时初始化数据库文件或写入 → 随机 `SQLITE_BUSY`

## 已知解决方案

| 方案 | 可行性 | 权衡 |
|------|--------|------|
| `maxForks: 1` 单进程串行 | ✅ 100% 消除 | 测试时间 ×2（15-20s） |
| `threads` 模式 | ❌ | better-sqlite3 同步绑定与 worker_threads 不兼容 |
| 每个测试用独立 DB 文件 + 随机文件名 | 🔲 可尝试 | 实现复杂 |

## 建议

保持当前配置（`maxForks=4`），接受 ~20% flaky 率。CI 中可设 `maxForks=1` 确保稳定（半小时内的时间差异在 CI 中可接受）。

---

*2026-05-20 · v1.6.0 · 代码助手*
