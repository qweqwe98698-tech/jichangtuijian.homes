/**
 * 生产环境只读核验（发布之后再跑一次，对真实域名，不是 dist）。
 * 覆盖总指令 §7（Googlebot/Bingbot 是否被 Cloudflare 误伤）与 §18（发布后抽查）。
 *
 * 用法：node scripts/production-check.mjs
 * 只发 GET 请求，不修改任何线上状态。抽样而非全站扫描——全站扫描属于本地 pnpm seo:check 的职责。
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const HOST = 'jichangtuijian.homes';
const SITE = `https://${HOST}`;
const TIMEOUT_MS = 10000;

const UA = {
  browser:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
};

async function fetchWithUA(url, ua) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua },
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = await res.text();
    return { ok: true, status: res.status, finalUrl: res.url, body };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? `超时 (${TIMEOUT_MS}ms)` : e.message };
  } finally {
    clearTimeout(timer);
  }
}

const CHALLENGE_MARKERS = [
  'Just a moment',
  'cf-chl',
  '__cf_chl',
  'Attention Required! | Cloudflare',
  'Enable JavaScript and cookies to continue',
  'Checking your browser before accessing',
];
const looksLikeChallenge = (body) => CHALLENGE_MARKERS.some((m) => body.includes(m));
const isNoindex = (html) => /name="robots"\s+content="[^"]*noindex/.test(html);
const noindexAllowed = (path) =>
  path === '/404.html' || path.startsWith('/search/') || path.startsWith('/brands/');

// ── 抽样 URL：核心专题页 + 3 篇文章 + 3 个品牌页（对应总指令 §18 的抽查范围）──
const SRC_PAGES = resolve(ROOT, 'src/pages');
const coreDirs = existsSync(SRC_PAGES)
  ? readdirSync(SRC_PAGES).filter((name) => {
      const full = join(SRC_PAGES, name);
      try {
        return statSync(full).isDirectory() && existsSync(join(full, 'index.astro'));
      } catch {
        return false;
      }
    })
  : [];
const hubSample = ['/', ...coreDirs.slice(0, 6).map((d) => `/${d}/`)];

function sampleArticles() {
  const dir = resolve(ROOT, 'src/content/articles');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const section of ['guides', 'best', 'reviews']) {
    const sdir = join(dir, section);
    if (!existsSync(sdir)) continue;
    const files = readdirSync(sdir).filter((f) => f.endsWith('.md'));
    if (files[0]) out.push(`/${section}/${files[0].replace(/\.md$/, '')}/`);
  }
  return out;
}
function sampleBrands() {
  const dir = resolve(ROOT, 'src/content/brands');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .slice(0, 3)
    .map((f) => `/brands/${f.replace(/\.json$/, '')}/`);
}

const SAMPLE_PATHS = [...new Set([...hubSample, ...sampleArticles(), ...sampleBrands()])];

console.log(
  `抽样 ${SAMPLE_PATHS.length} 个 URL（专题页 + 文章 + 品牌页），逐一用浏览器 UA / Googlebot UA / bingbot UA 各请求一次……`,
);

const rows = [];
for (const path of SAMPLE_PATHS) {
  const url = SITE + path;
  const [browser, googlebot, bingbot] = await Promise.all([
    fetchWithUA(url, UA.browser),
    fetchWithUA(url, UA.googlebot),
    fetchWithUA(url, UA.bingbot),
  ]);
  rows.push({ path, url, browser, googlebot, bingbot });
}

const networkFailures = rows.filter((r) => !r.browser.ok);
const botBlocked = rows.filter(
  (r) =>
    r.browser.ok &&
    r.browser.status === 200 &&
    [r.googlebot, r.bingbot].some(
      (b) => !b.ok || b.status !== r.browser.status || (b.ok && looksLikeChallenge(b.body)),
    ),
);
const brokenCore = rows.filter((r) => r.browser.ok && r.browser.status !== 200);
const canonicalErrors = [];
const noindexHits = [];
const missingSchema = [];
for (const r of rows) {
  if (!r.browser.ok || r.browser.status !== 200) continue;
  const html = r.browser.body;
  const canonical = html.match(/rel="canonical"\s+href="([^"]*)"/)?.[1];
  const expected = SITE + r.path;
  if (canonical !== expected)
    canonicalErrors.push(`${r.path} — canonical=${canonical ?? '缺失'}，应为 ${expected}`);
  if (isNoindex(html)) {
    noindexHits.push(r.path);
    if (!noindexAllowed(r.path)) canonicalErrors.push(`${r.path} — 非白名单页面出现 noindex`);
  }
  if (!html.includes('application/ld+json')) missingSchema.push(r.path);
}

// ── robots.txt ──
// 按 RFC 9309 真正分组解析，而不是用正则囫囵扫全文——不然非贪婪匹配会跨组把后面
// GPTBot 等专属分组里的 Disallow: / 误判成通配组的规则（本脚本早期版本踩过这个坑）。
function parseRobotsGroups(txt) {
  const groups = [];
  let current = null;
  for (const raw of txt.split(/\r?\n/)) {
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
  return groups;
}
const robotsRes = await fetchWithUA(`${SITE}/robots.txt`, UA.browser);
let robotsStatus = '未知';
if (robotsRes.ok && robotsRes.status === 200) {
  const txt = robotsRes.body;
  const hasSitemap = /Sitemap:\s*https:\/\/jichangtuijian\.homes/.test(txt);
  const groups = parseRobotsGroups(txt);
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  const blocksAll = wildcard.some((g) => g.rules.some((r) => /^Disallow:\s*\/\s*$/i.test(r)));
  const multipleWildcard = wildcard.length > 1;
  const botBlocked = ['Googlebot', 'bingbot'].filter((bot) =>
    groups
      .filter((g) => g.agents.some((a) => a.toLowerCase() === bot.toLowerCase()))
      .some((g) => g.rules.some((r) => /^Disallow:\s*\/\s*$/i.test(r))),
  );
  robotsStatus = !hasSitemap
    ? '缺少 Sitemap 声明'
    : blocksAll
      ? '通配组 Disallow: / 疑似全站屏蔽'
      : multipleWildcard
        ? `存在 ${wildcard.length} 个 User-agent: * 组（可能是 Cloudflare 托管注入未关闭，按 RFC 9309 部分爬虫只读第一组）`
        : botBlocked.length
          ? `${botBlocked.join('/')} 被专属分组 Disallow: / 屏蔽`
          : '正常';
} else {
  robotsStatus = `无法访问（${robotsRes.ok ? robotsRes.status : robotsRes.error}）`;
}

// ── sitemap-index.xml ──
const sitemapRes = await fetchWithUA(`${SITE}/sitemap-index.xml`, UA.browser);
let liveSitemapCount = null;
let sitemapNote = '';
if (sitemapRes.ok && sitemapRes.status === 200) {
  const nestedLocs = [...sitemapRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  let total = 0;
  for (const nested of nestedLocs) {
    const r = await fetchWithUA(nested, UA.browser);
    if (r.ok && r.status === 200) total += [...r.body.matchAll(/<loc>/g)].length;
  }
  liveSitemapCount = total;
} else {
  sitemapNote = `sitemap-index.xml 无法访问（${sitemapRes.ok ? sitemapRes.status : sitemapRes.error}）`;
}

// ── IndexNow key 文件 ──
let indexNowStatus = '未配置';
try {
  const siteTs = readFileSync(resolve(ROOT, 'src/lib/site.ts'), 'utf8');
  const key = siteTs.match(/INDEXNOW_KEY\s*=\s*'([^']*)'/)?.[1] ?? '';
  if (key) {
    const keyRes = await fetchWithUA(`${SITE}/${key}.txt`, UA.browser);
    indexNowStatus =
      keyRes.ok && keyRes.status === 200 && keyRes.body.trim() === key
        ? '已启用，线上 key 文件可访问且内容匹配'
        : `已配置但线上 key 文件异常（${keyRes.ok ? keyRes.status : keyRes.error}）`;
  }
} catch {
  indexNowStatus = '未知（读取本地 src/lib/site.ts 失败）';
}

// 本地基线交叉参考（如果存在）
let baselineNote = '无本地基线文件可比对';
const baselinePath = resolve(ROOT, 'seo-baseline.json');
if (existsSync(baselinePath)) {
  try {
    const b = JSON.parse(readFileSync(baselinePath, 'utf8'));
    baselineNote = `本地基线（${b.updatedAt}）：sitemap ${b.sitemapUrlCount} / 页面 ${b.pageCount}`;
  } catch {
    /* ignore */
  }
}

// ── 输出 ──
console.log('\nPRODUCTION SEO STATUS\n');
console.log(`Domain: ${HOST}`);
console.log('Build: 本次为线上抽样核验，未重新构建（构建校验见 pnpm seo:check）');
console.log(
  `Pages: 本次抽样 ${SAMPLE_PATHS.length} 个 URL（非全站扫描，全站结构性检查见本地 pnpm seo:check）`,
);
console.log(`Indexable Pages: 抽样中 ${SAMPLE_PATHS.length - noindexHits.length} 个可索引`);
console.log(`Sitemap URLs: ${liveSitemapCount ?? `无法获取（${sitemapNote}）`}（${baselineNote}）`);
console.log(`Noindex Pages: 抽样中 ${noindexHits.length} 个（${noindexHits.join(', ') || '无'}）`);
console.log(
  `Broken Links: 本次未做全站死链扫描（N/A，属本地 seo:check 职责）；抽样内核心页面非 200 数：${brokenCore.length}`,
);
console.log(`Canonical Errors: ${canonicalErrors.length}`);
console.log(`Robots: ${robotsStatus}`);
console.log(
  `Production URLs: ${rows.length - networkFailures.length}/${rows.length} 可访问；Bot UA 被拦截/异常：${botBlocked.length}`,
);
console.log(`IndexNow: ${indexNowStatus}`);

const problems = [];
if (networkFailures.length)
  problems.push(`${networkFailures.length} 个抽样 URL 请求失败（本环境出网或目标不可达）`);
if (brokenCore.length) problems.push(`${brokenCore.length} 个核心页面未返回 200`);
if (botBlocked.length)
  problems.push(
    `${botBlocked.length} 个页面疑似 Googlebot/bingbot 被拦截（Cloudflare Bot Fight Mode / WAF / JS Challenge）`,
  );
if (canonicalErrors.length) problems.push(`${canonicalErrors.length} 条 canonical/noindex 异常`);
if (robotsStatus !== '正常') problems.push(`robots.txt 状态：${robotsStatus}`);

console.log(`\nSEO Health: ${problems.length ? 'NEEDS_ATTENTION' : 'PASS'}`);
if (problems.length) {
  console.log('\n问题清单：');
  for (const p of problems) console.log(`  · ${p}`);
  for (const r of botBlocked) {
    console.log(
      `  · ${r.path} — browser=${r.browser.status} googlebot=${r.googlebot.ok ? r.googlebot.status : r.googlebot.error} bingbot=${r.bingbot.ok ? r.bingbot.status : r.bingbot.error}`,
    );
  }
  for (const c of canonicalErrors) console.log(`  · ${c}`);
}

console.log(`\nPRODUCTION_STATUS:\n${problems.length ? 'NEEDS_ATTENTION' : 'LIVE_HEALTHY'}`);

process.exit(problems.length ? 1 : 0);
