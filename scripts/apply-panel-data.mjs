/**
 * 把 measurements/panel/*.json（第三方测速面板导出的转录数据）合并进品牌档案。
 *
 * 来源等级：「第三方公开数据」——有真实测量过程，但不是本站执行，且面板时间戳已被移除。
 * 因此写入的数据行 status 一律为 'measured'。本站不做统一环境下的独立测速，
 * 数据来源等级中没有「本站实测」这一档，'measured' 不存在升级通道。
 *
 * 用法：
 *   node scripts/apply-panel-data.mjs             # 应用全部
 *   node scripts/apply-panel-data.mjs --dry-run   # 只报告
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PANEL_DIR = resolve(process.cwd(), 'measurements/panel');
const BRAND_DIR = resolve(process.cwd(), 'src/content/brands');
const dryRun = process.argv.includes('--dry-run');

function readJson(path) {
  const raw = readFileSync(path, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${path} 不是合法 JSON：${e.message}`);
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * 0 值来自未测通的节点（面板显示 0ms / 0B）。直接当作区间下限会渲染成「延迟 0ms」，
 * 是本站最不该犯的那种误导。这里把它剔除并要求人工重新取值。
 */
const nonZero = (v) => {
  const n = num(v);
  return n === 0 ? null : n;
};
const fmtRange = (a, b, unit) => {
  const lo = num(a);
  const hi = num(b);
  if (lo === null && hi === null) return null;
  if (lo === null || hi === null) return `${lo ?? hi}${unit}`;
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
};

function upsertFact(facts, label, value, note, status) {
  const fact = { label, value, status, note };
  const i = facts.findIndex((f) => f.label === label);
  if (i >= 0) facts[i] = fact;
  else facts.push(fact);
}

if (!existsSync(PANEL_DIR)) {
  console.error('measurements/panel/ 不存在，请先完成面板数据转录。');
  process.exit(1);
}

const files = readdirSync(PANEL_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
if (!files.length) {
  console.log('measurements/panel/ 下没有可应用的转录文件。');
  process.exit(0);
}

let applied = 0;
const warnings = [];

/**
 * 写入前先查重：同一份面板导出被挂到多个品牌名下时，至少有一个品牌的数据是假的。
 * 这类品牌一律跳过，不靠人记住——脚本自己拦。
 */
const fingerprint = (d) =>
  `${d.totalNodes}||${(d.regions ?? [])
    .map(
      (r) =>
        `${r.name}:${r.nodes}:${r.latencyMinMs}-${r.latencyMaxMs}:${r.avgSpeedMinMB}-${r.avgSpeedMaxMB}`,
    )
    .sort()
    .join('|')}`;

const fpMap = new Map();
for (const f of files) {
  const slug = f.replace('.json', '');
  const fp = fingerprint(readJson(resolve(PANEL_DIR, f)));
  if (!fpMap.has(fp)) fpMap.set(fp, []);
  fpMap.get(fp).push(slug);
}
const blocked = new Set();
for (const group of fpMap.values()) {
  if (group.length > 1) group.forEach((s) => blocked.add(s));
}

/** slug → 品牌中文名，用于面向读者的说明文案 */
const brandName = (slug) => {
  const p = resolve(BRAND_DIR, `${slug}.json`);
  return existsSync(p) ? (readJson(p).name ?? slug) : slug;
};

/** slug → 与之重复的同组品牌 */
const dupePeers = new Map();
for (const group of fpMap.values()) {
  if (group.length > 1) {
    for (const s of group)
      dupePeers.set(
        s,
        group.filter((x) => x !== s),
      );
  }
}

for (const f of files) {
  const slug = f.replace('.json', '');

  if (blocked.has(slug)) {
    // 关键：不只是「不写入」，还要撤回此前可能已写入的数据。
    // 品牌 A 先写入、随后品牌 B 转录完成才暴露重复——这种时序下 A 的旧数据必须被清掉。
    const brandPath = resolve(BRAND_DIR, `${slug}.json`);
    if (existsSync(brandPath)) {
      const brand = readJson(brandPath);
      const before = brand.facts.length;
      brand.facts = brand.facts.filter((x) => x.status !== 'measured');
      const removed = before - brand.facts.length;
      brand.panel = null;
      const peerNames = dupePeers.get(slug).map(brandName).join('、');
      brand.panelDisputed = `该品牌的测速面板导出与${peerNames}完全相同——同一份测速结果被挂到了多个品牌名下，其中至少有一份的品牌归属是错的。在归属澄清之前，本站不展示这份面板数据与截图。`;
      if (!dryRun) writeFileSync(brandPath, JSON.stringify(brand, null, 2) + '\n', 'utf8');
      warnings.push(
        `${slug}：指纹与 ${dupePeers.get(slug).join('、')} 重复，已标记存疑` +
          (removed ? `并撤回此前写入的 ${removed} 条数据行` : '，未写入'),
      );
    }
    continue;
  }
  const brandPath = resolve(BRAND_DIR, `${slug}.json`);
  if (!existsSync(brandPath)) {
    warnings.push(`${slug}：找不到对应品牌档案，已跳过`);
    continue;
  }

  const p = readJson(resolve(PANEL_DIR, f));
  const brand = readJson(brandPath);
  brand.panelDisputed = null;

  // 一致性校验：地区节点数之和必须等于总节点数
  const regions = (p.regions ?? []).filter((r) => r && r.name);
  const sum = regions.reduce((n, r) => n + (num(r.nodes) ?? 0), 0);
  if (num(p.totalNodes) !== null && sum !== p.totalNodes) {
    warnings.push(`${slug}：地区节点数之和 ${sum} ≠ 总节点数 ${p.totalNodes}，请复核转录`);
  }

  const provenance = [
    p.source?.tool ? `工具 ${p.source.tool}` : null,
    num(p.source?.threads) ? `${p.source.threads} 线程` : null,
    p.source?.backend ? `后端 ${p.source.backend}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const timeNote = p.source?.testedAt
    ? `测试于 ${p.source.testedAt}${p.source.inPeakWindow ? '（落在晚高峰窗口 20:30–22:30 内）' : ''}`
    : p.accountRows?.planExpiry
      ? `面板时间戳已移除；由账户信息推断测试早于 ${p.accountRows.planExpiry}`
      : '面板时间戳已移除，测试时间未知';
  const baseNote = `${provenance}${provenance ? ' · ' : ''}${timeNote}`;

  brand.panel = {
    tool: p.source?.tool ?? null,
    threads: num(p.source?.threads),
    backend: p.source?.backend ?? null,
    durationSec: num(p.source?.durationSec),
    pingCount: num(p.source?.pingCount),
    protocolShown: p.protocolShown ?? null,
    totalNodes: num(p.totalNodes),
    testedAt: p.source?.testedAt ?? null,
    inPeakWindow: typeof p.source?.inPeakWindow === 'boolean' ? p.source.inPeakWindow : null,
    testedBefore: p.accountRows?.planExpiry ?? null,
    regions: regions.map((r) => {
      if (num(r.latencyMinMs) === 0 || num(r.avgSpeedMinMB) === 0) {
        warnings.push(
          `${slug} / ${r.name}：区间下限为 0（含未测通节点），已剔除该下限，请人工重新取值后再发布该地区`,
        );
      }
      return {
        name: r.name,
        nodes: num(r.nodes) ?? 0,
        latencyMinMs: nonZero(r.latencyMinMs),
        latencyMaxMs: num(r.latencyMaxMs),
        avgSpeedMinMB: nonZero(r.avgSpeedMinMB),
        avgSpeedMaxMB: num(r.avgSpeedMaxMB),
        maxSpeedMaxMB: num(r.maxSpeedMaxMB),
      };
    }),
    anomalies: Array.isArray(p.anomalies) ? p.anomalies : [],
  };

  // 数据行：节点规模与覆盖地区
  if (num(p.totalNodes) !== null) {
    upsertFact(brand.facts, '节点数量', `${p.totalNodes} 个（面板导出计数）`, baseNote, 'measured');
    applied++;
  }
  if (regions.length) {
    upsertFact(
      brand.facts,
      '节点地区覆盖',
      regions.map((r) => `${r.name} ${r.nodes}`).join(' · '),
      '按面板导出的节点命名归类',
      'measured',
    );
    applied++;

    // 主力地区（节点最多的那个）的延迟与速度区间
    const main = [...regions].sort((a, b) => (b.nodes ?? 0) - (a.nodes ?? 0))[0];
    const lat = fmtRange(nonZero(main.latencyMinMs), main.latencyMaxMs, ' ms');
    const spd = fmtRange(nonZero(main.avgSpeedMinMB), main.avgSpeedMaxMB, ' MB/s');
    if (lat) {
      upsertFact(
        brand.facts,
        `${main.name}节点延迟`,
        lat,
        `${main.nodes} 个节点的区间 · ${baseNote}`,
        'measured',
      );
      applied++;
    }
    if (spd) {
      upsertFact(
        brand.facts,
        `${main.name}节点平均速度`,
        spd,
        `${main.nodes} 个节点的区间 · 非晚高峰专门测试，${timeNote}`,
        'measured',
      );
      applied++;
    }
  }

  // 协议实际下发情况：与宣传口径对照的重要事实
  if (p.protocolShown) {
    upsertFact(
      brand.facts,
      '面板显示协议',
      p.protocolShown,
      '测速面板中节点的类型列；可能与官网宣传的协议口径不同，以实际订阅为准',
      'measured',
    );
    applied++;
  }

  if (!dryRun) writeFileSync(brandPath, JSON.stringify(brand, null, 2) + '\n', 'utf8');
  console.log(
    `✓ ${slug}：${p.totalNodes ?? '?'} 节点 / ${regions.length} 个地区${
      p.accountRows?.planExpiry ? ` · 测试早于 ${p.accountRows.planExpiry}` : ''
    }`,
  );
}

for (const w of warnings) console.log(`⚠ ${w}`);
console.log(
  `\n${dryRun ? '[dry-run] ' : ''}处理 ${files.length} 个品牌，写入 ${applied} 条「第三方实测」数据行。`,
);
