#!/usr/bin/env node
/**
 * brain-memory 工程卫生检查脚本
 * 用法：node scripts/check-health.cjs
 * 建议：配合 coverage 使用 → npx vitest run --coverage && node scripts/check-health.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ── Utilities ─────────────────────────────────────────────────

function color(level) {
  const pct = typeof level === 'number' ? level : parseFloat(level);
  if (pct >= 80) return '\x1b[32m';
  if (pct >= 60) return '\x1b[33m';
  return '\x1b[31m';
}
const R = '\x1b[0m';
const B = '\x1b[1m';
function pad(s, len) { return String(s).padEnd(len); }

// ── 1. Coverage Blind Spot Heatmap ────────────────────────────

function coverageHeatmap() {
  const summaryPath = path.join(ROOT, 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.log('⚠️  No coverage-summary.json. Run `npx vitest run --coverage` first.\n');
    return false;
  }

  const data = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const modules = [];

  for (const [file, stats] of Object.entries(data)) {
    if (file === 'total') continue;
    if (!file.startsWith('src/') && !file.startsWith(path.join(ROOT, 'src'))) continue;

    const shortName = file.replace(path.join(ROOT, ''), '').replace('src/', '');
    const stmts = stats.statements?.pct ?? 0;
    const branches = stats.branches?.pct ?? 0;
    const funcs = stats.functions?.pct ?? 0;
    const lines = stats.lines?.pct ?? 0;
    const avg = Math.round((stmts + branches + funcs + lines) / 4);

    if (avg < 80) {
      modules.push({ name: shortName, stmts, branches, funcs, lines, avg });
    }
  }

  modules.sort((a, b) => a.avg - b.avg);

  console.log(B + '\n📊 Coverage Blind Spot Heatmap (< 80%)' + R);
  console.log('─'.repeat(80));
  console.log(pad('Module', 35) + pad('Stmts', 9) + pad('Branch', 9) + pad('Funcs', 9) + pad('Lines', 9));
  console.log('─'.repeat(80));

  for (const m of modules) {
    const c = color(m.avg);
    console.log(
      pad(m.name, 35) +
      c + pad(m.stmts.toFixed(1) + '%', 9) +
      pad(m.branches.toFixed(1) + '%', 9) +
      pad(m.funcs.toFixed(1) + '%', 9) +
      pad(m.lines.toFixed(1) + '%', 9) + R
    );
  }

  if (modules.length === 0) {
    console.log('  ✅ All modules ≥ 80%');
  } else {
    console.log(`\n🔴 Top 3: ${modules.slice(0, 3).map(m => m.name + ' (' + m.avg + '%)').join(', ')}`);
  }

  return true;
}

// ── 2. Lint Warning Triage ─────────────────────────────────────

function lintTriage() {
  console.log(B + '\n📋 Lint Warning Triage' + R);
  console.log('─'.repeat(80));

  try {
    const output = execSync('npx eslint src/**/*.ts 2>&1 || true', { cwd: ROOT, encoding: 'utf-8' });
    const allLines = output.split('\n');

    // Parse file-level warnings
    const fileWarnings = {};
    let currentFile = null;

    for (const line of allLines) {
      // File path line
      const fileMatch = line.match(/^\/(.+)\.ts$/);
      if (fileMatch) {
        currentFile = fileMatch[0].replace(ROOT + '/', '');
        if (!fileWarnings[currentFile]) {
          fileWarnings[currentFile] = { errors: 0, warnings: 0, messages: [] };
        }
        continue;
      }

      // Warning line: "  15:24  warning  'text' is defined but never used   no-unused-vars"
      const warnMatch = line.match(/^\s+(\d+:\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}\S+)?$/);
      if (warnMatch && currentFile) {
        const [, , severity, msg] = warnMatch;
        if (severity === 'error') fileWarnings[currentFile].errors++;
        else fileWarnings[currentFile].warnings++;
        if (fileWarnings[currentFile].messages.length < 2) {
          fileWarnings[currentFile].messages.push(msg.trim());
        }
      }
    }

    const errors = Object.values(fileWarnings).reduce((s, f) => s + f.errors, 0);
    const warnings = Object.values(fileWarnings).reduce((s, f) => s + f.warnings, 0);

    console.log(`Errors: ${errors}  Warnings: ${warnings}  Files: ${Object.keys(fileWarnings).length}`);
    console.log();

    // Group by category
    const interf = [], poc = [], other = [];
    for (const [file, info] of Object.entries(fileWarnings)) {
      const total = info.errors + info.warnings;
      if (file.includes('adapter') || file.includes('lancedb')) {
        interf.push({ file, total, info });
      } else if (file.includes('hooks') || file.includes('core.ts') || file.includes('heuristic')) {
        poc.push({ file, total, info });
      } else {
        other.push({ file, total, info });
      }
    }

    console.log('By category:');
    console.log(`  接口契约/POC 桩: ${interf.reduce((s, i) => s + i.total, 0) + poc.reduce((s, i) => s + i.total, 0)} warnings (${interf.length + poc.length} files)`);
    console.log(`  其他: ${other.reduce((s, i) => s + i.total, 0)} warnings (${other.length} files)`);

    if (other.length > 0) {
      console.log('\n  ⚠️  Need manual review:');
      for (const o of other) {
        console.log(`    ${o.file}: ${o.total} issues`);
        for (const msg of o.info.messages) {
          console.log(`      - ${msg}`);
        }
      }
    } else {
      console.log('  ✅ All warnings are known-acceptable patterns (interface/POC stubs)');
    }

    // Trend comparison
    const prevPath = path.join(ROOT, '.devdocs', 'lint-baseline.json');
    if (fs.existsSync(prevPath)) {
      const prev = JSON.parse(fs.readFileSync(prevPath, 'utf-8'));
      const delta = warnings - prev.warnings;
      const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '—';
      console.log(`\n  Trend: ${prev.warnings} → ${warnings} (${arrow}${Math.abs(delta)})`);
    }

    // Save current baseline
    const baselinesDir = path.join(ROOT, '.devdocs');
    if (!fs.existsSync(baselinesDir)) fs.mkdirSync(baselinesDir, { recursive: true });
    fs.writeFileSync(path.join(baselinesDir, 'lint-baseline.json'), JSON.stringify({ date: new Date().toISOString().split('T')[0], warnings, errors }, null, 2));

    return { errors, warnings, files: Object.keys(fileWarnings).length };
  } catch (err) {
    console.log(`  ⚠️  Lint failed: ${err.message}`);
    return null;
  }
}

// ── 3. Deprecated & Outdated Dependencies ──────────────────────

function deprecatedCheck() {
  console.log(B + '\n📦 Deprecated & Outdated Dependencies' + R);
  console.log('─'.repeat(80));

  try {
    // npm outdated exits with code 1 when there ARE outdated packages
    let result;
    try {
      result = execSync('npm outdated --json 2>/dev/null', { cwd: ROOT, encoding: 'utf-8' });
    } catch (e) {
      // Exit code 1 = outdated packages exist, stdout still has JSON
      result = e.stdout || e.message || '';
    }

    let outdated;
    try {
      outdated = JSON.parse(result.trim());
    } catch {
      // npm outdated with no outdated deps outputs empty
      console.log('  ✅ All dependencies up to date');
      return { deprecated: 0, outdated: 0 };
    }

    if (Object.keys(outdated).length === 0) {
      console.log('  ✅ All dependencies up to date');
      return { deprecated: 0, outdated: 0 };
    }

    let outCount = 0;
    let majorCount = 0;

    for (const [name, info] of Object.entries(outdated)) {
      const curMajor = parseInt(String(info.current).split('.')[0]);
      const latestMajor = parseInt(String(info.latest).split('.')[0]);
      const isMajor = curMajor < latestMajor;
      const prefix = isMajor ? '🔴 ' : '   ';
      console.log(`  ${prefix}${name.padEnd(30)} ${String(info.current).padEnd(10)} → ${String(info.latest)}`);
      outCount++;
      if (isMajor) majorCount++;
    }

    console.log(`\n  Outdated: ${outCount} (${majorCount} major version gaps)`);
    return { outdated: outCount, majorGaps: majorCount };
  } catch (err) {
    console.log(`  ⚠️  npm outdated failed: ${err.message}`);
    return null;
  }
}

// ── 4. npm Audit ──────────────────────────────────────────────

function auditCheck() {
  console.log(B + '\n🔒 Security Audit' + R);
  console.log('─'.repeat(80));

  try {
    const result = execSync('npm audit --json 2>/dev/null || echo "{}"', { cwd: ROOT, encoding: 'utf-8' });
    let audit;
    try { audit = JSON.parse(result.trim()); } catch { audit = {}; }

    const vulns = audit?.metadata?.vulnerabilities || {};
    const total = Object.entries(vulns).reduce((s, [k, v]) => k === 'total' ? s : s + v, 0);

    if (total === 0) {
      console.log('  ✅ 0 vulnerabilities');
    } else {
      console.log(`  ❌ ${total} vulnerabilities:`);
      for (const [sev, count] of Object.entries(vulns)) {
        if (sev !== 'total' && count > 0) {
          console.log(`     ${sev}: ${count}`);
        }
      }
    }
    return total;
  } catch (err) {
    console.log(`  ⚠️  Audit failed: ${err.message}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────

console.log(B + '\n🏥 brain-memory Health Check' + R);
console.log(`  ${new Date().toISOString().split('T')[0]}`);
console.log('═'.repeat(80));

const hasCoverage = coverageHeatmap();
const lintResult = lintTriage();
const depResult = deprecatedCheck();
const auditResult = auditCheck();

// ── Decision Support Summary ───────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log(B + '📋 Decision Support Summary' + R);
console.log('─'.repeat(80));

const items = [];
if (lintResult) {
  const status = lintResult.errors > 0 ? '🔴' : lintResult.warnings > 30 ? '🟡' : '🟢';
  items.push(`${status} Lint: ${lintResult.errors} errors, ${lintResult.warnings} warnings (${lintResult.files} files)`);
}
if (depResult) {
  const status = depResult.majorGaps > 2 ? '🟡' : '🟢';
  items.push(`${status} Dependencies: ${depResult.outdated} outdated (${depResult.majorGaps} major)`);
}
if (auditResult !== null) {
  const status = auditResult > 0 ? '🔴' : '🟢';
  items.push(`${status} Security: ${auditResult} vulnerabilities`);
}

for (const item of items) console.log(item);
if (!hasCoverage) console.log('💡 Run with coverage for blind spot heatmap');

console.log();
