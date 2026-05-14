#!/usr/bin/env node
/**
 * JSDoc 覆盖率扫描脚本
 * 扫描 src/ 下所有 .ts 文件，统计 export 数量和 JSDoc 注释比例
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function scanDir(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
      scanDir(full, results);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const files = scanDir('./src');
const byModule = {};

let totalExports = 0;
let docExports = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  let fileTotal = 0;
  let fileDoc = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^export\s+(function|class|interface|type|const|enum)\b/.test(line)) {
      totalExports++;
      fileTotal++;
      // Look backwards for /** ... */ JSDoc block (skipping blank lines)
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === '') j--;
      if (j >= 0 && lines[j].trim().endsWith('*/')) {
        while (j >= 0 && !lines[j].trim().startsWith('/**')) j--;
        if (j >= 0) {
          docExports++;
          fileDoc++;
        }
      }
    }
  }

  if (fileTotal > 0) {
    const relPath = file.replace('./src/', '');
    byModule[relPath] = { total: fileTotal, doc: fileDoc, pct: fileTotal > 0 ? ((fileDoc / fileTotal) * 100).toFixed(1) : '0.0' };
  }
}

console.log(`\n=== JSDoc 覆盖率摸底报告 ===\n`);
console.log(`总导出数: ${totalExports}`);
console.log(`有 JSDoc: ${docExports}`);
console.log(`整体覆盖率: ${((docExports / totalExports) * 100).toFixed(1)}%\n`);

console.log('=== 按模块分解 ===');
console.log(`模块`.padEnd(40) + ' 导出数'.padStart(6) + ' 有注释'.padStart(6) + ' 覆盖率');
console.log('-'.repeat(65));

const sorted = Object.entries(byModule).sort((a, b) => (a[1].pct) - (b[1].pct));
for (const [mod, data] of sorted) {
  console.log(mod.padEnd(40) + `  ${data.total.toString().padStart(5)}  ${data.doc.toString().padStart(5)}  ${data.pct}%`);
}
