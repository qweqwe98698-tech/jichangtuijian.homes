/**
 * 面板数据查重与可用性体检。
 *
 * 为什么需要它：测速面板导出图很容易被张冠李戴——同一份导出换个标题就变成另一个品牌的「实测」。
 * 这个脚本用数值指纹比对所有转录结果，任何两个品牌指纹相同都会被拦下。
 * 指纹相同 = 至少有一个品牌的数据是错的，在人工澄清之前不允许发布。
 *
 * 同时体检两类会误导读者的数值：
 *   - 延迟或速度最小值为 0：说明该地区含未测通节点，直接取 min 会显示成「延迟 0ms」
 *   - 地区节点数之和与总节点数对不上：转录有误
 *
 * 用法：node scripts/check-panel-duplicates.mjs
 * 退出码非 0 表示存在阻断级问题，不应继续发布。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PANEL_DIR = resolve(process.cwd(), 'measurements/panel');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

if (!existsSync(PANEL_DIR)) {
  console.error('measurements/panel/ 不存在');
  process.exit(1);
}

const files = readdirSync(PANEL_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const entries = files.map((f) => ({
  slug: f.replace('.json', ''),
  data: readJson(resolve(PANEL_DIR, f)),
}));

/** 数值指纹：总节点数 + 各地区(名称:节点数:延迟区间:速度区间) 排序后拼接 */
function fingerprint(d) {
  const regions = (d.regions ?? [])
    .map(
      (r) =>
        `${r.name}:${r.nodes}:${r.latencyMinMs}-${r.latencyMaxMs}:${r.avgSpeedMinMB}-${r.avgSpeedMaxMB}`,
    )
    .sort()
    .join('|');
  return `${d.totalNodes}||${regions}`;
}

const byFingerprint = new Map();
for (const e of entries) {
  const fp = fingerprint(e.data);
  if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
  byFingerprint.get(fp).push(e.slug);
}

let blocking = 0;

console.log(`已转录 ${entries.length} 个品牌的面板数据。\n`);

// ── 查重 ──
const dupes = [...byFingerprint.values()].filter((g) => g.length > 1);
if (dupes.length) {
  console.log('■ 阻断级问题：数值指纹重复（同一份导出被挂到多个品牌名下）');
  for (const group of dupes) {
    console.log(`  ✗ ${group.join(' ≡ ')}`);
    const sample = entries.find((e) => e.slug === group[0]).data;
    console.log(
      `    共同特征：${sample.totalNodes} 节点 / ${sample.regions?.length ?? 0} 地区` +
        (sample.accountRows?.remainingTrafficGB
          ? ` / 剩余流量 ${sample.accountRows.remainingTrafficGB}GB`
          : '') +
        (sample.accountRows?.planExpiry ? ` / 套餐到期 ${sample.accountRows.planExpiry}` : ''),
    );
    blocking++;
  }
  console.log('  → 在确认哪个品牌对应这份数据之前，涉及的品牌一律不得发布面板数据。\n');
} else {
  console.log('✓ 查重：没有发现指纹重复的品牌\n');
}

// ── 账户信息行重复（更强的同源信号） ──
const acctMap = new Map();
for (const e of entries) {
  const a = e.data.accountRows;
  if (!a?.remainingTrafficGB && !a?.planExpiry) continue;
  const key = `${a.remainingTrafficGB}|${a.planExpiry}`;
  if (!acctMap.has(key)) acctMap.set(key, []);
  acctMap.get(key).push(e.slug);
}
const acctDupes = [...acctMap.entries()].filter(([, g]) => g.length > 1);
if (acctDupes.length) {
  console.log('■ 阻断级问题：账户信息行重复（剩余流量与套餐到期完全相同）');
  for (const [key, group] of acctDupes) {
    console.log(`  ✗ ${group.join(' ≡ ')}（${key}）`);
    blocking++;
  }
  console.log('');
}

// ── 数值可用性体检 ──
const issues = [];
for (const e of entries) {
  const d = e.data;
  const sum = (d.regions ?? []).reduce((n, r) => n + (r.nodes ?? 0), 0);
  if (typeof d.totalNodes === 'number' && sum !== d.totalNodes) {
    issues.push(`${e.slug}：地区节点数之和 ${sum} ≠ 总节点数 ${d.totalNodes}`);
  }
  for (const r of d.regions ?? []) {
    if (r.latencyMinMs === 0) {
      issues.push(`${e.slug} / ${r.name}：延迟最小值为 0ms，该地区含未测通节点，不能直接展示区间`);
    }
    if (r.avgSpeedMinMB === 0) {
      issues.push(
        `${e.slug} / ${r.name}：平均速度最小值为 0，该地区含未测通节点，不能直接展示区间`,
      );
    }
  }
}
if (issues.length) {
  console.log('▲ 需要人工处理的数值问题：');
  for (const i of issues) console.log(`  · ${i}`);
  console.log('');
} else {
  console.log('✓ 数值体检：无 0 值区间、节点数自洽\n');
}

// ── 测试时效 ──
const dated = entries.filter((e) => e.data.accountRows?.planExpiry);
if (dated.length) {
  console.log('· 可推断的测试时间上界：');
  for (const e of dated) {
    console.log(`  ${e.slug}：测试早于 ${e.data.accountRows.planExpiry}`);
  }
  console.log('');
}

if (blocking) {
  console.log(`结论：发现 ${blocking} 组阻断级问题，不应发布面板数据。`);
  process.exit(1);
}
console.log('结论：未发现阻断级问题。');
