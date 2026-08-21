/**
 * IndexNow 主动推送：把站点 URL 提交给 Bing / Yandex 等支持该协议的搜索引擎。
 *
 * 启用前需要两步（缺一不可，否则 IndexNow 会拒绝）：
 *   1. 在 src/lib/site.ts 的 INDEXNOW_KEY 填入一个 8–128 位十六进制密钥
 *   2. 在 public/ 下创建同名文件 <key>.txt，内容就是该密钥本身
 *
 * 用法（路径参数**不要带前导斜杠**，原因见下）：
 *   node scripts/indexnow-submit.mjs airport-ranking/ cheap-airport/   # 提交指定页
 *   node scripts/indexnow-submit.mjs --dry-run airport-ranking/        # 只打印，不提交
 *   node scripts/indexnow-submit.mjs --all                             # 提交 sitemap 全部 URL
 *
 * ⚠️ 为什么不要带前导斜杠：Git Bash（MSYS2）会把 `/airport-ranking/` 当成 Unix 绝对路径，
 *    在参数到达 node 之前就改写成 `C:/Program Files/Git/airport-ranking/`。旧版本用
 *    `a.startsWith('/')` 筛参数，改写后筛不到任何东西，于是**静默**回落到「读 sitemap 提交全部」——
 *    同一条命令在 PowerShell 下提交 2 条、在 Git Bash 下提交 102 条，全程无告警。
 *    现在带斜杠的写法仍然接受（PowerShell / CI 下本来就正常），但一旦检测到参数已被改写，
 *    脚本直接报错退出，绝不回落到全量提交。
 *    临时逃生口：MSYS_NO_PATHCONV=1 node scripts/indexnow-submit.mjs /airport-ranking/
 *
 * 说明：IndexNow 只是「通知」，不保证收录。协议语义是「这条 URL 变了」——
 * 反复告知全站 URL 都变了、而爬虫抓下来发现内容没变，会导致该 host 的提交信号被降权直至忽略。
 * 所以超过 BULK_LIMIT 条必须显式传 --all，把「我确实要全量提交」变成一个有意识的动作。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const HOST = 'jichangtuijian.homes';
const SITE = `https://${HOST}`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
/** 超过这个条数就要求显式 --all。挡住 Git Bash 静默全量，也挡住裸跑手滑。 */
const BULK_LIMIT = 20;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const submitAll = args.includes('--all');
const pathArgs = args.filter((a) => !a.startsWith('--'));

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

/** Git Bash 改写后的形状：C:/... 或 C:\...。单个字母 + 冒号，https: 不会误命中。 */
const MANGLED = /^[A-Za-z]:[\\/]/;

/** 把用户给的各种写法归一成 /path/ 形式；发现被 shell 改写过就当场报错。 */
function normalizePath(raw) {
  let p = raw.startsWith(SITE) ? raw.slice(SITE.length) || '/' : raw;

  if (MANGLED.test(p)) {
    fail(
      `参数「${raw}」已被 Git Bash（MSYS2）改写成本机绝对路径，不是你想提交的站内路径。\n` +
        '换成不带前导斜杠的写法：\n' +
        '  node scripts/indexnow-submit.mjs airport-ranking/\n' +
        '或临时关掉路径转换：\n' +
        '  MSYS_NO_PATHCONV=1 node scripts/indexnow-submit.mjs /airport-ranking/',
    );
  }

  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p += '/'; // 站点 trailingSlash: 'always'
  return p;
}

/** dist 里有没有这个页面。dist 不存在时返回 null（无从判断，不拦）。 */
function builtInDist(path) {
  if (!existsSync(DIST)) return null;
  const clean = path.replace(/^\//, '').replace(/\/$/, '');
  return existsSync(join(DIST, clean, 'index.html')) || existsSync(join(DIST, `${clean}.html`));
}

// 从 src/lib/site.ts 读取密钥，避免密钥出现在两个地方
const siteTs = readFileSync(resolve(process.cwd(), 'src/lib/site.ts'), 'utf8');
const key = siteTs.match(/INDEXNOW_KEY\s*=\s*'([^']*)'/)?.[1] ?? '';

if (!key) {
  console.log(
    'IndexNow 未启用：src/lib/site.ts 的 INDEXNOW_KEY 为空。\n' +
      '启用方法：填入一个 8–128 位十六进制密钥，并在 public/ 下放同名 <key>.txt（内容为该密钥）。',
  );
  process.exit(0);
}
if (!existsSync(resolve(process.cwd(), 'public', `${key}.txt`))) {
  fail(`缺少密钥文件 public/${key}.txt —— IndexNow 会因无法校验而拒绝提交。`);
}

let urls;
if (pathArgs.length) {
  const paths = [...new Set(pathArgs.map(normalizePath))];

  // 提交一个不存在的 URL 等于给 Bing 一条噪声，先拦下来
  const missing = paths.filter((p) => builtInDist(p) === false);
  if (missing.length) {
    fail(
      `以下路径在 dist/ 里不存在，可能是拼写错误或还没构建：\n${missing
        .map((p) => `  ${p}`)
        .join('\n')}\n先跑 pnpm build，或核对路径拼写。`,
    );
  }

  urls = paths.map((p) => SITE + p);
} else {
  if (!submitAll) {
    fail(
      '没有指定要提交的页面。\n' +
        '  只提交改动过的页：node scripts/indexnow-submit.mjs airport-ranking/ cheap-airport/\n' +
        '  确实要提交全站：  node scripts/indexnow-submit.mjs --all\n' +
        'IndexNow 的语义是「这条 URL 变了」，无差别全量提交会让该 host 的提交信号被降权，所以全量必须显式声明。',
    );
  }
  if (!existsSync(DIST)) fail('dist/ 不存在，请先执行 pnpm build');

  const collected = [];
  for (const f of readdirSync(DIST).filter((x) => /^sitemap.*\.xml$/.test(x))) {
    const xml = readFileSync(join(DIST, f), 'utf8');
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (!/sitemap.*\.xml$/.test(loc)) collected.push(loc);
    }
  }
  urls = [...new Set(collected)];
}

if (!urls.length) fail('没有可提交的 URL');

// 兜底：显式路径也可能一次给了几十条，这里统一再挡一次
if (urls.length > BULK_LIMIT && !submitAll) {
  fail(
    `本次将提交 ${urls.length} 条 URL，超过 ${BULK_LIMIT} 条的安全上限。\n` +
      '确认这些页面确实都有内容变更之后，显式加 --all 重跑。',
  );
}

const payload = { host: HOST, key, keyLocation: `${SITE}/${key}.txt`, urlList: urls };

if (dryRun) {
  console.log(`[dry-run] 将向 IndexNow 提交 ${urls.length} 条 URL：`);
  for (const u of urls.slice(0, 10)) console.log(`  ${u}`);
  if (urls.length > 10) console.log(`  … 另有 ${urls.length - 10} 条`);
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});

// IndexNow 成功返回 200 或 202；422 通常是密钥文件校验失败
console.log(`IndexNow 响应：${res.status} ${res.statusText}`);
if (res.ok) console.log(`已提交 ${urls.length} 条 URL。收录与否由搜索引擎决定，本操作不保证收录。`);
else {
  console.error(await res.text().catch(() => ''));
  process.exit(1);
}
