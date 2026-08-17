/**
 * SEO 发布安全门禁：在 `pnpm build` 之后、部署之前必须跑绿的最后一关。
 *
 * 覆盖范围刻意与 audit-site.mjs / check-links.mjs / tests/seo.test.ts 不同——
 * 那几个脚本各自独立检查过一遍产物是这个项目一贯的写法（见它们各自文件头注释），
 * 这里不重复搬运它们已经查过的项目，只做三类它们都没做的事：
 *   1）内部链接死链复用 check-links.mjs 的结果（不再重复扫一遍 dist）
 *   2）本脚本独有的检查：noindex 白名单、canonical 自指、sitemap/页面数基线异常、
 *      未知目录（防黑/误生成）、核心 URL 抽查、标题去重
 *   3）把所有结果汇总成用户要看的固定格式报告，给出 RELEASE_DECISION
 *
 * 用法：pnpm build 之后执行 `pnpm seo:check`
 * 退出码非 0 = RELEASE_DECISION: BLOCKED，不应部署。
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = resolve(ROOT, 'dist');
const SITE = 'https://jichangtuijian.homes';
const BASELINE_PATH = resolve(ROOT, 'seo-baseline.json');

const result = {
  build: null,
  robots: null,
  noindex: null,
  canonical: null,
  sitemap: null,
  internalLinks: null,
  coreUrls: null,
  schema: null,
  duplicateTitles: null,
  pageCount: null,
};
const blockingByCategory = {};
const notesByCategory = {};
const block = (cat, msg) => (blockingByCategory[cat] ??= []).push(msg);
const note = (cat, msg) => (notesByCategory[cat] ??= []).push(msg);

// ── Build ──
if (!existsSync(DIST)) {
  console.log(
    'SEO HEALTH CHECK\n\nBuild: BLOCKED\n\n■ dist/ 不存在，请先执行 pnpm build\n\nRELEASE_DECISION: BLOCKED',
  );
  process.exit(1);
}
result.build = 'PASS';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'pagefind') continue;
      walk(p, out);
    } else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = walk(DIST).map((file) => {
  const url =
    '/' +
    relative(DIST, file)
      .replace(/\\/g, '/')
      .replace(/index\.html$/, '');
  return { file, url, html: readFileSync(file, 'utf8') };
});

const isNoindex = (html) => /name="robots"\s+content="[^"]*noindex/.test(html);
const noindexAllowed = (url) =>
  url === '/404.html' || url.startsWith('/search/') || url.startsWith('/brands/');

// ── Noindex 白名单 ──
let noindexCount = 0;
for (const page of pages) {
  if (!isNoindex(page.html)) continue;
  noindexCount++;
  if (!noindexAllowed(page.url)) {
    block(
      'noindex',
      `${page.url} — 非白名单页面出现 noindex（白名单仅限 404 / /search/ / /brands/ 未核验品牌页）`,
    );
  }
}
result.noindex = blockingByCategory.noindex ? 'BLOCKED' : 'PASS';

// ── Canonical 自指 ──
let canonicalAnomalies = 0;
for (const page of pages) {
  const canonical = page.html.match(/rel="canonical"\s+href="([^"]*)"/)?.[1];
  // Astro 的 404 路由内部 pathname 是 /404/，只是静态托管要求输出文件叫 404.html（Cloudflare Pages 约定），
  // 二者不是同一回事：canonical 由 Astro.url.pathname 算出，因此这里按 /404/ 比对，而不是按输出文件名。
  const expected = SITE + (page.url === '/404.html' ? '/404/' : page.url);
  if (!canonical) {
    canonicalAnomalies++;
    block('canonical', `${page.url} — 缺少 canonical`);
  } else if (canonical !== expected) {
    canonicalAnomalies++;
    block('canonical', `${page.url} — canonical 指向 ${canonical}，应为 ${expected}`);
  }
}
result.canonical = blockingByCategory.canonical ? 'BLOCKED' : 'PASS';

// ── Robots.txt ──
const robotsPath = join(DIST, 'robots.txt');
let robotsStatus = '未生成';
if (!existsSync(robotsPath)) {
  block('robots', '全站 — 缺少 robots.txt');
} else {
  const robots = readFileSync(robotsPath, 'utf8');
  if (!/Sitemap:\s*https:\/\/jichangtuijian\.homes/.test(robots))
    block('robots', 'robots.txt — 缺少正确的 Sitemap 声明');

  const groups = [];
  let current = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const ua = line.match(/^User-agent:\s*(.+)$/i);
    if (ua) {
      if (!current || current.rules.length) current = { agents: [], rules: [] };
      if (!groups.includes(current)) groups.push(current);
      current.agents.push(ua[1].trim());
    } else if (current && /^(?:Allow|Disallow):/i.test(line)) {
      current.rules.push(line);
    }
  }
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  if (wildcard.some((g) => g.rules.some((r) => /^Disallow:\s*\/\s*$/i.test(r))))
    block('robots', 'robots.txt — 通配组 Disallow: / 会屏蔽全站');
  if (wildcard.length > 1)
    block(
      'robots',
      `robots.txt — 存在 ${wildcard.length} 个 User-agent: * 组，按 RFC 9309 部分爬虫只读第一组`,
    );

  // Googlebot / bingbot 不得在任何专属分组里被单独 Disallow: /
  for (const bot of ['Googlebot', 'bingbot']) {
    const own = groups.filter((g) => g.agents.some((a) => a.toLowerCase() === bot.toLowerCase()));
    if (own.some((g) => g.rules.some((r) => /^Disallow:\s*\/\s*$/i.test(r))))
      block('robots', `robots.txt — ${bot} 被专属分组 Disallow: / 屏蔽`);
  }
  robotsStatus = blockingByCategory.robots
    ? '存在阻断问题'
    : '正常，放行 Googlebot / bingbot，Sitemap 已声明';
}
result.robots = blockingByCategory.robots ? 'BLOCKED' : 'PASS';

// ── Sitemap ──
const sitemapFiles = readdirSync(DIST).filter((f) => /^sitemap.*\.xml$/.test(f));
const sitemapUrls = [];
const sitemapUrlSet = new Set();
if (!sitemapFiles.length) {
  block('sitemap', '全站 — 未生成 sitemap');
} else {
  for (const f of sitemapFiles) {
    const xml = readFileSync(join(DIST, f), 'utf8');
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (/sitemap.*\.xml$/.test(loc)) continue;
      sitemapUrls.push(loc);
      if (!loc.startsWith(SITE)) block('sitemap', `sitemap — URL 未使用正式域名：${loc}`);
      if (/localhost|127\.0\.0\.1|example\.com|\.pages\.dev/.test(loc))
        block('sitemap', `sitemap — 出现测试/预览域名：${loc}`);
    }
  }
  const dupes = sitemapUrls.filter((u) => sitemapUrlSet.has(u) || !sitemapUrlSet.add(u));
  if (dupes.length)
    block('sitemap', `sitemap — 重复 URL ${[...new Set(dupes)].length} 条，如：${dupes[0]}`);

  for (const page of pages) {
    const abs = SITE + page.url;
    const noidx = isNoindex(page.html);
    if (noidx && sitemapUrlSet.has(abs))
      block('sitemap', `sitemap — noindex 页面不应出现在 sitemap：${page.url}`);
    if (!noidx && page.url !== '/404.html' && !sitemapUrlSet.has(abs))
      note('sitemap', `可索引页面未进入 sitemap：${page.url}`);
  }
}
result.sitemap = blockingByCategory.sitemap ? 'BLOCKED' : 'PASS';

// ── 未知目录 / 疑似垃圾页面 ──
const SRC_PAGES = resolve(ROOT, 'src/pages');
const PUBLIC = resolve(ROOT, 'public');
const KNOWN_BUILD_ARTIFACTS = new Set(['_astro', 'pagefind']);
const pageAllow = new Set(
  readdirSync(SRC_PAGES)
    .filter((n) => n !== '[section]')
    .map((n) => n.replace(/\.(astro|ts|js|mjs)$/, ''))
    .flatMap((n) => (n === '404' ? ['404.html'] : n === 'index' ? ['index.html'] : [n])),
);
const publicAllow = new Set(existsSync(PUBLIC) ? readdirSync(PUBLIC) : []);
const unknownTop = readdirSync(DIST).filter(
  (name) =>
    !pageAllow.has(name) &&
    !publicAllow.has(name) &&
    !KNOWN_BUILD_ARTIFACTS.has(name) &&
    !/^sitemap.*\.xml$/.test(name) &&
    name !== 'rss.xml',
);
for (const u of unknownTop)
  block(
    'pageCount',
    `dist/ 出现未登记的顶层条目：${u}（不在 src/pages 或 public 里，需先确认来源再处理，不得直接删除）`,
  );

// ── 页面数量 / sitemap 数量基线异常 ──
let baseline = null;
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    note('pageCount', 'seo-baseline.json 解析失败，已忽略');
  }
}
function checkAnomaly(cat, label, current, previous) {
  if (previous == null) return;
  if (previous <= 0) return;
  const ratio = current / previous;
  if (ratio < 0.85)
    block(
      cat,
      `${label} 从 ${previous} 降到 ${current}（下降 ${Math.round((1 - ratio) * 100)}%），可能存在批量下线或构建异常`,
    );
  else if (ratio > 1.5)
    block(
      cat,
      `${label} 从 ${previous} 增到 ${current}（增长 ${Math.round((ratio - 1) * 100)}%），可能存在误生成或被植入大量页面`,
    );
}
checkAnomaly('pageCount', 'dist 页面总数', pages.length, baseline?.pageCount);
checkAnomaly('sitemap', 'sitemap URL 数', sitemapUrlSet.size, baseline?.sitemapUrlCount);
if (!baseline) note('pageCount', '未找到历史基线，本次结果将作为新基线');
result.pageCount = blockingByCategory.pageCount ? 'BLOCKED' : 'PASS';
if (blockingByCategory.sitemap) result.sitemap = 'BLOCKED';

// ── 核心 URL 抽查 ──
const CORE_DIRS = readdirSync(SRC_PAGES).filter((name) => {
  const full = join(SRC_PAGES, name);
  return statSync(full).isDirectory() && existsSync(join(full, 'index.astro'));
});
const CORE_URLS = ['/', ...CORE_DIRS.map((d) => `/${d}/`)];
for (const url of CORE_URLS) {
  const page = pages.find((p) => p.url === url);
  if (!page) {
    block('coreUrls', `${url} — 构建产物中找不到该核心页面`);
    continue;
  }
  // /search/ 等页面即使有自己的 index.astro、被算作「核心目录」，也在 noindex 白名单内——
  // 那是有意为之（见 Noindex 检查），不该在这里重复报错。
  if (isNoindex(page.html) && !noindexAllowed(page.url))
    block('coreUrls', `${url} — 核心页面被标记 noindex`);
  if (!/rel="canonical"/.test(page.html)) block('coreUrls', `${url} — 核心页面缺少 canonical`);
}
result.coreUrls = blockingByCategory.coreUrls ? 'BLOCKED' : 'PASS';

// ── Schema JSON-LD 语法有效性 ──
let schemaErrors = 0;
for (const page of pages) {
  for (const [, raw] of page.html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      JSON.parse(raw);
    } catch (e) {
      schemaErrors++;
      block('schema', `${page.url} — JSON-LD 语法错误：${e.message}`);
    }
  }
}
result.schema = blockingByCategory.schema ? 'BLOCKED' : 'PASS';

// ── 标题去重（仅对可索引页面）──
const titleMap = new Map();
let dupTitles = 0;
for (const page of pages) {
  if (isNoindex(page.html)) continue;
  const title = page.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  if (titleMap.has(title)) {
    dupTitles++;
    block('duplicateTitles', `Title 重复：「${title}」— ${titleMap.get(title)} 与 ${page.url}`);
  } else {
    titleMap.set(title, page.url);
  }
}
result.duplicateTitles = blockingByCategory.duplicateTitles ? 'BLOCKED' : 'PASS';

// ── Internal Links（复用 check-links.mjs）──
let linkCheckOutput = '';
let linkCheckOk = true;
try {
  linkCheckOutput = execFileSync('node', [resolve(ROOT, 'scripts/check-links.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
} catch (e) {
  linkCheckOk = false;
  linkCheckOutput = (e.stdout || '') + (e.stderr || e.message || '');
}
if (!linkCheckOk) {
  for (const line of linkCheckOutput
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 30))
    block('internalLinks', line.trim());
}
result.internalLinks = linkCheckOk ? 'PASS' : 'BLOCKED';

// ── IndexNow 状态 ──
let indexNowStatus = '未启用';
try {
  const siteTs = readFileSync(resolve(ROOT, 'src/lib/site.ts'), 'utf8');
  const key = siteTs.match(/INDEXNOW_KEY\s*=\s*'([^']*)'/)?.[1] ?? '';
  if (key) {
    indexNowStatus = existsSync(join(DIST, `${key}.txt`))
      ? '已启用，key 文件校验通过'
      : `已配置 key 但缺少 public/${key}.txt，提交会被拒绝`;
  }
} catch {
  indexNowStatus = '未知（读取 src/lib/site.ts 失败）';
}

// ── 汇总输出 ──
const CATS = [
  ['build', 'Build'],
  ['robots', 'Robots'],
  ['noindex', 'Noindex'],
  ['canonical', 'Canonical'],
  ['sitemap', 'Sitemap'],
  ['internalLinks', 'Internal Links'],
  ['coreUrls', 'Core URLs'],
  ['schema', 'Schema'],
  ['duplicateTitles', 'Duplicate Titles'],
  ['pageCount', 'Page Count'],
];
const overallBlocked = CATS.some(([k]) => result[k] === 'BLOCKED');

console.log(
  `站点概况：${pages.length} 个页面 / sitemap ${sitemapUrlSet.size} 条 URL / noindex ${noindexCount} 个（均在白名单内：${!blockingByCategory.noindex}）/ canonical 异常 ${canonicalAnomalies} 个 / robots.txt ${robotsStatus} / IndexNow ${indexNowStatus}`,
);
console.log('\nSEO HEALTH CHECK\n');
for (const [key, label] of CATS) console.log(`${label}: ${result[key]}`);
console.log(`\nRELEASE_DECISION: ${overallBlocked ? 'BLOCKED' : 'READY'}`);

if (overallBlocked) {
  console.log('\n阻断详情：');
  for (const [key, label] of CATS) {
    const items = blockingByCategory[key];
    if (!items?.length) continue;
    console.log(`\n■ ${label}（${items.length}）`);
    for (const i of [...new Set(items)].slice(0, 30)) console.log(`  · ${i}`);
  }
}
const allNotes = Object.values(notesByCategory).flat();
if (allNotes.length) {
  console.log('\n说明项（不阻断）：');
  for (const n of [...new Set(allNotes)].slice(0, 20)) console.log(`  · ${n}`);
}

// 只有全绿时才把本次结果前进为新基线（棘轮式，避免一次带病构建把基线带偏）
if (!overallBlocked) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        sitemapUrlCount: sitemapUrlSet.size,
        pageCount: pages.length,
      },
      null,
      2,
    ) + '\n',
  );
}

process.exit(overallBlocked ? 1 : 0);
