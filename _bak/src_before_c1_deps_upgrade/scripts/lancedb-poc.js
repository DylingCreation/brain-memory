/**
 * LanceDB POC — 快速验证脚本
 * 验证 LanceDB 本地安装、表创建、数据插入、向量搜索。
 */
import { writeFileSync } from "node:fs";

async function main() {
  // Dynamic import for ESM
  const lancedb = await import("@lancedb/lancedb");

  // Connect to local LanceDB
  const db = await lancedb.connect("/tmp/brain-memory-lancedb-poc");
  console.log("✅ LanceDB connected");

  // Create a test table with vector column
  try { await db.dropTable("test_nodes"); } catch {}
  
  const table = await db.createTable("test_nodes", [
    {
      id: "n1",
      name: "node-alpha",
      content: "deploy Docker container with port mapping",
      vector: Array(128).fill(0).map(() => Math.random() * 2 - 1),
      status: "active",
      created_at: Date.now(),
    },
    {
      id: "n2",
      name: "node-beta",
      content: "fix Docker port conflict on port 8080",
      vector: Array(128).fill(0).map(() => Math.random() * 2 - 1),
      status: "active",
      created_at: Date.now(),
    },
    {
      id: "n3",
      name: "node-gamma",
      content: "Python Flask application setup guide",
      vector: Array(128).fill(0).map(() => Math.random() * 2 - 1),
      status: "active",
      created_at: Date.now(),
    },
  ]);
  console.log(`✅ Table created with ${await table.countRows()} rows`);

  // Vector search
  const queryVec = Array(128).fill(0).map(() => Math.random() * 2 - 1);
  const results = await table.vectorSearch(queryVec).limit(3).toArray();
  console.log(`✅ Vector search returned ${results.length} results`);
  console.log(`   Top result: ${results[0].name} (distance: ${results[0]._distance.toFixed(4)})`);

  // Filter + search
  const filtered = await table.vectorSearch(queryVec)
    .where("status = 'active'")
    .limit(2)
    .toArray();
  console.log(`✅ Filtered search: ${filtered.length} results`);

  // Cleanup
  await db.dropTable("test_nodes");
  console.log("✅ Cleaned up");

  console.log("\n🎉 LanceDB POC PASSED");
  return true;
}

main().catch((err) => {
  console.error("❌ FAILED:", err.message);
  process.exit(1);
});
