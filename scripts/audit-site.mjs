/**
 * 全站构建产物审计。对应最终验收清单 §1–§14 中可自动化的部分。
 *
 * 它检查 dist/ 里真实产出的 HTML，而不是读源码猜测——「必须实际运行构建进行验证」。
 *
 * 用法：pnpm build 之后执行 `pnpm audit:site`
 * 退出码非 0 表示存在阻断级问题。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const SITE = 'https://jichangtuijian.homes';

if (!existsSync(DIST)) {
  console.error('dist/ 不存在，请先执行 pnpm build');
  process.exit(1);
}

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

const pages = walk(DIST).map((file) => ({
  file,
  url:
    '/' +
    relative(DIST, file)
      .replace(/\\/g, '/')
      .replace(/index\.html$/, ''),
  html: readFileSync(file, 'utf8'),
}));

const blocking = [];
const warnings = [];
const notes = [];

const add = (list, page, msg) => list.push(`${page.url} — ${msg}`);

// ── §1 残留占位符与开发环境痕迹 ──
const FORBIDDEN = [
  { re: /localhost:\d+/g, label: 'localhost 地址' },
  { re: /https?:\/\/example\.com/gi, label: 'example.com 示例链接' },
  { re: /\bTODO\b|\bFIXME\b|待补充占位/g, label: 'TODO / FIXME 未完成标记' },
  { re: /Lorem ipsum/gi, label: '占位文本' },
];

/**
 * 定位红线：本站是资料评测 / 编辑评估站点，不进行统一环境下的独立测速。
 * 任何暗示「本站测过」或「本站即将自动测」的措辞都会误导读者，一律拦下。
 * 若将来真的具备统一测试条件，应先更新 /methodology/ 说明测试方式，再放开这里。
 */
const FORBIDDEN_CLAIMS = [
  { re: /本站实测|本站已实测|本站测速|我们实测/g, label: '暗示本站做过测速' },
  { re: /实测数据(?!没有|缺)/g, label: '「实测数据」表述（本站无此类数据）' },
  { re: /连续七天(测试|实测|观测本站)/g, label: '暗示本站执行连续多日测试' },
  { re: /晚高峰实测/g, label: '暗示本站做过晚高峰实测' },
  { re: /待实测|性能待补充|待补充数据/g, label: '暗示未来会补上测试数据' },
  { re: /本站(将|会|即将)(进行|开展|完成)(实测|测速|复测)/g, label: '承诺未来实测' },
  { re: /(复测|实测)(完成|完毕)后/g, label: '暗示本站会完成实测' },
];

// ── 逐页检查 ──
for (const page of pages) {
  const { html } = page;
  const isNoindex = /name="robots"\s+content="[^"]*noindex/.test(html);

  for (const f of FORBIDDEN) {
    const hits = html.match(f.re);
    if (hits) add(blocking, page, `${f.label}：${[...new Set(hits)].slice(0, 3).join(', ')}`);
  }

  // 只看正文，避免误伤 <script> 里的注释与 JSON-LD
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ');
  for (const f of FORBIDDEN_CLAIMS) {
    const hits = bodyText.match(f.re);
    if (hits) add(blocking, page, `${f.label}：${[...new Set(hits)].slice(0, 3).join(', ')}`);
  }

  // §2 H1 数量
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) add(blocking, page, `H1 数量为 ${h1s}，应为 1`);

  // §2 Title / Description
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  const desc = html.match(/name="description"\s+content="([^"]*)"/)?.[1] ?? '';
  if (!title) add(blocking, page, '缺少 Title');
  if (!desc) add(blocking, page, '缺少 Meta Description');
  if (desc && desc.length < 40) add(warnings, page, `Description 过短（${desc.length} 字符）`);

  // §2 Canonical
  const canonical = html.match(/rel="canonical"\s+href="([^"]*)"/)?.[1];
  if (!canonical) add(blocking, page, '缺少 canonical');
  else if (!canonical.startsWith(SITE))
    add(blocking, page, `canonical 未使用正式域名：${canonical}`);

  // §2 Open Graph / Twitter Card
  for (const prop of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) {
    if (!html.includes(`property="${prop}"`)) add(warnings, page, `缺少 ${prop}`);
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    if (!html.includes(`name="${name}"`)) add(warnings, page, `缺少 ${name}`);
  }
  const ogImage = html.match(/property="og:image"\s+content="([^"]*)"/)?.[1];
  if (ogImage && !/^https?:\/\//.test(ogImage)) add(blocking, page, 'og:image 非绝对地址');

  // §4 JSON-LD 语法与域名
  const ldBlocks = [
    ...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g),
  ];
  if (!isNoindex && ldBlocks.length === 0) add(warnings, page, '缺少 JSON-LD 结构化数据');
  for (const [, raw] of ldBlocks) {
    try {
      const parsed = JSON.parse(raw);
      const json = JSON.stringify(parsed);
      // schema.org 是 JSON-LD 的标准 @context，不算站外域名
      const badDomain = json.match(/https?:\/\/(?!jichangtuijian\.homes|schema\.org)[^"',}\]]+/g);
      if (badDomain) add(warnings, page, `JSON-LD 含站外域名：${badDomain.slice(0, 2).join(', ')}`);
    } catch (e) {
      add(blocking, page, `JSON-LD 语法错误：${e.message}`);
    }
  }

  // §11 图片 alt 与尺寸
  for (const [, tag] of html.matchAll(/(<img\b[^>]*>)/g)) {
    if (!/\salt="/.test(tag)) add(blocking, page, `图片缺少 alt：${tag.slice(0, 80)}`);
    else if (/\salt=""/.test(tag) && !/role="presentation"|aria-hidden/.test(tag))
      add(warnings, page, `图片 alt 为空且未标记为装饰性：${tag.slice(0, 80)}`);
    if (!/\swidth="/.test(tag) || !/\sheight="/.test(tag))
      add(warnings, page, `图片缺少 width/height（可能造成 CLS）：${tag.slice(0, 80)}`);
  }

  // §11 标题层级连续性（不得跳级）
  const headings = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] - headings[i - 1] > 1)
      add(warnings, page, `标题层级跳级：h${headings[i - 1]} → h${headings[i]}`);
  }

  // §11 语言属性
  if (!/<html[^>]+lang="zh-CN"/.test(html)) add(blocking, page, '缺少或错误的 html lang 属性');

  // §8 外链安全属性
  for (const [, tag] of html.matchAll(/(<a\b[^>]*target="_blank"[^>]*>)/g)) {
    if (!/rel="[^"]*noopener/.test(tag))
      add(blocking, page, `新窗口链接缺少 noopener：${tag.slice(0, 90)}`);
  }
  for (const [, tag] of html.matchAll(
    /(<a\b[^>]*href="https?:\/\/(?!jichangtuijian)[^"]*"[^>]*>)/g,
  )) {
    if (!/rel="[^"]*(sponsored|nofollow|noopener)/.test(tag))
      add(warnings, page, `站外链接未设置 rel：${tag.slice(0, 90)}`);
  }
}

// ── §3 / §12 Sitemap 与 noindex 一致性 ──
const sitemapFiles = readdirSync(DIST).filter((f) => /^sitemap.*\.xml$/.test(f));
if (!sitemapFiles.length) blocking.push('全站 — 未生成 sitemap');
const sitemapUrls = new Set();
for (const f of sitemapFiles) {
  const xml = readFileSync(join(DIST, f), 'utf8');
  for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (/sitemap.*\.xml$/.test(loc)) continue;
    sitemapUrls.add(loc);
    if (!loc.startsWith(SITE)) blocking.push(`sitemap — URL 未使用正式域名：${loc}`);
  }
}
for (const page of pages) {
  const isNoindex = /name="robots"\s+content="[^"]*noindex/.test(page.html);
  const abs = SITE + page.url;
  if (isNoindex && sitemapUrls.has(abs)) {
    blocking.push(`sitemap — noindex 页面不应出现在 sitemap：${page.url}`);
  }
  if (
    !isNoindex &&
    page.url !== '/404.html' &&
    !sitemapUrls.has(abs) &&
    !page.url.includes('404')
  ) {
    warnings.push(`sitemap — 可索引页面未进入 sitemap：${page.url}`);
  }
}

// ── §3 robots.txt ──
const robotsPath = join(DIST, 'robots.txt');
if (!existsSync(robotsPath)) blocking.push('全站 — 缺少 robots.txt');
else {
  const robots = readFileSync(robotsPath, 'utf8');
  if (!/Sitemap:\s*https:\/\/jichangtuijian\.homes/.test(robots))
    blocking.push('robots.txt — 缺少正确的 Sitemap 声明');
  if (/Disallow:\s*\/\s*$/m.test(robots)) blocking.push('robots.txt — 误屏蔽全站');
}

// ── §3 RSS ──
if (!existsSync(join(DIST, 'rss.xml'))) warnings.push('全站 — 缺少 rss.xml');

// ── §7 锚文本多样性（同一目标使用大量完全相同锚文本） ──
const anchorMap = new Map();
for (const page of pages) {
  for (const [, href, text] of page.html.matchAll(
    /<a\b[^>]*href="(\/[^"#?]*)"[^>]*>([^<]{2,40})<\/a>/g,
  )) {
    const key = `${href}||${text.trim()}`;
    anchorMap.set(key, (anchorMap.get(key) ?? 0) + 1);
  }
}
const overused = [...anchorMap.entries()].filter(([, n]) => n > 40);
for (const [key, n] of overused) {
  const [href, text] = key.split('||');
  notes.push(
    `锚文本「${text}」指向 ${href} 出现 ${n} 次（多为全站导航，属正常；正文锚文本应保持多样）`,
  );
}

// ── 输出 ──
const section = (title, items, icon) => {
  if (!items.length) return;
  console.log(`\n${icon} ${title}（${items.length}）`);
  const shown = [...new Set(items)];
  for (const i of shown.slice(0, 40)) console.log(`  · ${i}`);
  if (shown.length > 40) console.log(`  … 另有 ${shown.length - 40} 条同类问题`);
};

console.log(`已审计 ${pages.length} 个页面、${sitemapUrls.size} 条 sitemap URL。`);
section('阻断级问题（必须修复）', blocking, '■');
section('建议修复', warnings, '▲');
section('说明项（无需处理）', notes, '·');

if (!blocking.length && !warnings.length) console.log('\n✓ 未发现问题。');
if (blocking.length) {
  console.log(`\n结论：${[...new Set(blocking)].length} 个阻断级问题，不应部署。`);
  process.exit(1);
}
console.log(
  `\n结论：无阻断级问题${warnings.length ? `，另有 ${[...new Set(warnings)].length} 条建议` : ''}。`,
);
