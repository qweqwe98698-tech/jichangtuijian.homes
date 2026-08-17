// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

const SITE_URL = 'https://jichangtuijian.homes';

/**
 * dataStatus 为 unverified 的品牌页会输出 noindex（见 src/pages/brands/[slug].astro），
 * 这里从同一份 JSON 推导出它们的 slug，保证 sitemap 与 noindex 不会各说各话。
 * 品牌补齐数据后 dataStatus 一变，两处同时自动生效，不需要改这个文件。
 *
 * 同一趟遍历顺带取 lastVerified，供下面的 lastmod 映射使用。
 */
const unverifiedBrandSlugs = [];
const lastmodByPath = new Map();
for (const f of readdirSync('./src/content/brands').filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(`./src/content/brands/${f}`, 'utf8'));
  const slug = f.replace(/\.json$/, '');
  if (data.dataStatus === 'unverified') unverifiedBrandSlugs.push(slug);
  if (data.lastVerified) lastmodByPath.set(`/brands/${slug}/`, data.lastVerified);
}

/**
 * 文章的 lastmod 取 updatedDate（没有就退回 pubDate）——不用 Content Layer 的
 * getCollection，因为 astro.config.mjs 在 Astro 初始化 Content Layer 之前就要跑完，
 * 所以直接读文件、正则取 frontmatter 字段，和上面读品牌 JSON 是同一套做法。
 */
for (const section of readdirSync('./src/content/articles', { withFileTypes: true })) {
  if (!section.isDirectory()) continue;
  const dir = `./src/content/articles/${section.name}`;
  for (const file of readdirSync(dir).filter((f) => /\.(md|mdx)$/.test(f))) {
    const text = readFileSync(`${dir}/${file}`, 'utf8');
    const pub = text.match(/^pubDate:\s*(\S+)/m)?.[1];
    const updated = text.match(/^updatedDate:\s*(\S+)/m)?.[1];
    if (pub)
      lastmodByPath.set(`/${section.name}/${file.replace(/\.(md|mdx)$/, '')}/`, updated ?? pub);
  }
}

/** 没有自己内容日期的页面（专题页、政策页等）统一退到站点最近编辑动作日期。 */
const siteFallbackDate =
  readFileSync('./src/lib/site.ts', 'utf8').match(/LAST_SITE_UPDATE\s*=\s*'([^']+)'/)?.[1] ??
  new Date().toISOString().slice(0, 10);

// 正式域名。canonical / sitemap / OG 全部基于此推导，禁止硬编码其他域名。
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  output: 'static',
  integrations: [
    mdx(),
    sitemap({
      // noindex 的页面不得进入 sitemap（/search/ 结果页、404、未核验的品牌占位页）
      filter: (page) =>
        !/\/search\/$/.test(page) &&
        !/\/404\/?$/.test(page) &&
        !unverifiedBrandSlugs.some((s) => page.endsWith(`/brands/${s}/`)),
      // lastmod 反映真实内容日期，不是构建时间——否则每次部署全站 lastmod 都会
      // 变成"刚刚"，搜索引擎很快会学会不再信任这个字段。
      serialize: (item) => {
        const path = item.url.replace(SITE_URL, '');
        const lastmod = item.lastmod ?? lastmodByPath.get(path) ?? siteFallbackDate;
        return { ...item, lastmod: new Date(lastmod).toISOString() };
      },
    }),
  ],
  markdown: {
    rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
