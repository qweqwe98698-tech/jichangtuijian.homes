// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

// 正式域名。canonical / sitemap / OG 全部基于此推导，禁止硬编码其他域名。
export default defineConfig({
  site: 'https://jichangtuijian.homes',
  trailingSlash: 'always',
  output: 'static',
  integrations: [
    mdx(),
    sitemap({
      // noindex 的页面不得进入 sitemap（/search/ 结果页、404）
      filter: (page) => !/\/search\/$/.test(page) && !/\/404\/?$/.test(page),
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
