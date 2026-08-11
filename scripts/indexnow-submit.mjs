/**
 * IndexNow 主动推送：把站点 URL 提交给 Bing / Yandex 等支持该协议的搜索引擎。
 *
 * 启用前需要两步（缺一不可，否则 IndexNow 会拒绝）：
 *   1. 在 src/lib/site.ts 的 INDEXNOW_KEY 填入一个 8–128 位十六进制密钥
 *   2. 在 public/ 下创建同名文件 <key>.txt，内容就是该密钥本身
 *
 * 用法：
 *   pnpm build && node scripts/indexnow-submit.mjs            # 提交 sitemap 里的全部 URL
 *   node scripts/indexnow-submit.mjs --dry-run                # 只打印将要提交的内容
 *   node scripts/indexnow-submit.mjs /reviews/guangsu-yun/    # 只提交指定路径
 *
 * 说明：IndexNow 只是「通知」，不保证收录。频繁重复提交没有额外收益。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');
const HOST = 'jichangtuijian.homes';
const SITE = `https://${HOST}`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const explicit = args.filter((a) => a.startsWith('/'));

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
  console.error(`缺少密钥文件 public/${key}.txt —— IndexNow 会因无法校验而拒绝提交。`);
  process.exit(1);
}

let urls = explicit.map((p) => SITE + p);
if (!urls.length) {
  if (!existsSync(DIST)) {
    console.error('dist/ 不存在，请先执行 pnpm build');
    process.exit(1);
  }
  for (const f of readdirSync(DIST).filter((x) => /^sitemap.*\.xml$/.test(x))) {
    const xml = readFileSync(join(DIST, f), 'utf8');
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (!/sitemap.*\.xml$/.test(loc)) urls.push(loc);
    }
  }
  urls = [...new Set(urls)];
}

if (!urls.length) {
  console.error('没有可提交的 URL');
  process.exit(1);
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
