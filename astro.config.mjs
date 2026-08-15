// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

/**
 * dataStatus 为 unverified 的品牌页会输出 noindex（见 src/pages/brands/[slug].astro），
 * 这里从同一份 JSON 推导出它们的 slug，保证 sitemap 与 noindex 不会各说各话。
 * 品牌补齐数据后 dataStatus 一变，两处同时自动生效，不需要改这个文件。
 */
const unverifiedBrandSlugs = readdirSync('./src/content/brands')
  .filter((f) => f.endsWith('.json'))
  .filter(
    (f) => JSON.parse(readFileSync(`./src/content/brands/${f}`, 'utf8')).dataStatus === 'unverified',
  )
  .map((f) => f.replace(/\.json$/, ''));

// 正式域名。canonical / sitemap / OG 全部基于此推导，禁止硬编码其他域名。
export default defineConfig({
  site: 'https://jichangtuijian.homes',
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
      serialize: (item) => ({ ...item, lastmod: item.lastmod ?? new Date().toISOString() }),
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
