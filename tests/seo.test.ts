/**
 * SEO 基线测试：对 dist 产物做页面级 SEO 契约检查（SEO-STRATEGY.md §3）。
 * 运行前需先 pnpm build。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(process.cwd(), 'dist');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'pagefind') continue;
      walk(p, out);
    } else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

let pages: { file: string; html: string }[] = [];

beforeAll(() => {
  expect(existsSync(DIST), 'dist/ 不存在，请先 pnpm build').toBe(true);
  pages = walk(DIST).map((file) => ({ file, html: readFileSync(file, 'utf8') }));
});

describe('页面级 SEO 契约', () => {
  it('每页有且仅有一个 title 与 description', () => {
    for (const { file, html } of pages) {
      expect(html.match(/<title>/g)?.length, `${file} title`).toBe(1);
      expect(html.includes('name="description"'), `${file} description`).toBe(true);
    }
  });

  it('每页有且仅有一个 H1', () => {
    for (const { file, html } of pages) {
      const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
      expect(h1s, `${file} 应有且仅有 1 个 H1，实际 ${h1s}`).toBe(1);
    }
  });

  it('Title 与 Description 全站唯一（无重复）', () => {
    const titles = new Map<string, string>();
    const descs = new Map<string, string>();
    for (const { file, html } of pages) {
      const t = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
      const d = html.match(/name="description" content="([^"]*)"/)?.[1] ?? '';
      expect(titles.has(t), `重复 Title: ${t}（${file} 与 ${titles.get(t)}）`).toBe(false);
      expect(descs.has(d), `重复 Description（${file} 与 ${descs.get(d)}）`).toBe(false);
      titles.set(t, file);
      descs.set(d, file);
    }
  });

  it('每页有 canonical 且指向正式域名', () => {
    for (const { file, html } of pages) {
      const m = html.match(/rel="canonical" href="([^"]+)"/);
      expect(m, `${file} 缺少 canonical`).toBeTruthy();
      expect(m![1]).toMatch(/^https:\/\/jichangtuijian\.homes\//);
    }
  });

  it('可索引页面均有 JSON-LD 结构化数据', () => {
    for (const { file, html } of pages) {
      if (html.includes('noindex')) continue;
      expect(html.includes('application/ld+json'), `${file} 缺少 JSON-LD`).toBe(true);
    }
  });

  it('没有空链接 href="" 或 href="#"', () => {
    for (const { file, html } of pages) {
      expect(html.includes('href=""'), `${file} 存在 href=""`).toBe(false);
      expect(html.includes('href="#"'), `${file} 存在 href="#"`).toBe(false);
    }
  });

  it('文章页无孤岛：每个文章 URL 至少被其他页面链接一次', () => {
    const articleDirs = ['guides', 'best', 'reviews', 'vs', 'apps', 'learn', 'fix', 'risk'];
    const articleUrls: string[] = [];
    for (const { file } of pages) {
      const rel = file.replace(DIST, '').replace(/\\/g, '/');
      const m = rel.match(/^\/([a-z]+)\/([a-z0-9-]+)\/index\.html$/);
      if (m && articleDirs.includes(m[1]!)) articleUrls.push(`/${m[1]}/${m[2]}/`);
    }
    expect(articleUrls.length).toBeGreaterThan(0);
    for (const url of articleUrls) {
      const inbound = pages.filter(
        ({ file, html }) =>
          !file.includes(join(url.slice(1, -1))) && html.includes(`href="${url}"`),
      );
      expect(inbound.length, `孤岛页面：${url} 没有任何入链`).toBeGreaterThan(0);
    }
  });
});
