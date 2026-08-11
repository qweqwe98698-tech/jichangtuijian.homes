/**
 * 站内死链检查：扫描 dist 下所有 HTML，收集内部 href，
 * 验证目标文件在 dist 中真实存在；同时拒绝 href="" 与 href="#"。
 * 用法：pnpm build 之后执行 `pnpm linkcheck`。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('dist/ 不存在，请先执行 pnpm build');
  process.exit(1);
}

const htmlFiles = walk(DIST);
const errors = [];
const hrefRe = /href="([^"]*)"/g;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(hrefRe)) {
    const href = m[1];
    if (href === '' || href === '#') {
      errors.push(`${file}: 空链接 href="${href}"`);
      continue;
    }
    // 只校验站内绝对路径链接
    if (!href.startsWith('/')) continue;
    if (href.startsWith('//')) continue;
    const clean = href.split('#')[0].split('?')[0];
    if (clean === '/') continue;
    const candidates = [
      join(DIST, clean),
      join(DIST, clean, 'index.html'),
      join(DIST, clean.replace(/\/$/, '') + '.html'),
    ];
    if (!candidates.some((c) => existsSync(c))) {
      errors.push(`${file}: 死链 ${href}`);
    }
  }
}

if (errors.length) {
  console.error(`发现 ${errors.length} 个链接问题:`);
  for (const e of [...new Set(errors)]) console.error('  ' + e.replace(DIST, 'dist'));
  process.exit(1);
}
console.log(`链接检查通过：${htmlFiles.length} 个页面，无死链、无空链接。`);
