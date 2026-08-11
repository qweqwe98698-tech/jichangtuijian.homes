/**
 * 引用数据的时效检查。
 *
 * 本站不做统一环境下的独立测速，因此这里检查的不是「本站实测数据过期」，
 * 而是**引用的第三方公开数据与渠道资料是否已经太旧**。过旧的数据应当撤下或重新核对，
 * 而不是继续挂在页面上让读者以为它反映现状。
 *
 * 用法：
 *   node scripts/check-data-freshness.mjs            # 报告
 *   node scripts/check-data-freshness.mjs --today=2026-11-20  # 指定基准日期
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BRAND_DIR = resolve(process.cwd(), 'src/content/brands');
/** 商务信息（价格、优惠码）变动快，超过这个天数就该重新核对 */
const COMMERCIAL_MAX_AGE = 90;
/** 第三方公开测试数据的参考价值随时间衰减得更快 */
const PANEL_MAX_AGE = 180;

const args = process.argv.slice(2);
const todayArg = args.find((a) => a.startsWith('--today='))?.split('=')[1];
const today = todayArg ? new Date(todayArg) : new Date();
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

const stale = [];
const ok = [];

for (const f of readdirSync(BRAND_DIR).filter((x) => x.endsWith('.json'))) {
  const brand = JSON.parse(readFileSync(resolve(BRAND_DIR, f), 'utf8').replace(/^﻿/, ''));

  if (brand.lastVerified) {
    const age = daysBetween(today, new Date(brand.lastVerified));
    if (age > COMMERCIAL_MAX_AGE) {
      stale.push(`${brand.name}：价格与优惠码核对于 ${brand.lastVerified}，已 ${age} 天，需重新核对`);
    } else {
      ok.push(`${brand.name}：商务信息 ${age} 天前核对，在有效期内`);
    }
  } else if (brand.priceFrom) {
    stale.push(`${brand.name}：有价格信息但缺少 lastVerified，无法判断时效`);
  }

  const at = brand.panel?.testedAt;
  if (at) {
    const d = new Date(at.replace(/\s+CST$/, ''));
    if (!Number.isNaN(d.getTime())) {
      const age = daysBetween(today, d);
      if (age > PANEL_MAX_AGE) {
        stale.push(`${brand.name}：引用的第三方数据采集于 ${at}，已 ${age} 天，建议撤下或更换`);
      }
    }
  }
}

console.log(`已检查 ${readdirSync(BRAND_DIR).length} 家品牌。\n`);
if (stale.length) {
  console.log('▲ 需要处理：');
  for (const s of stale) console.log(`  · ${s}`);
} else {
  console.log('✓ 所有引用数据都在有效期内。');
}
console.log(
  `\n说明：本站不做统一环境下的独立测速，本检查针对的是引用来源的时效，` +
    `不涉及任何本站测试数据。过期数据应撤下或重新核对，不要留着继续展示。`,
);
