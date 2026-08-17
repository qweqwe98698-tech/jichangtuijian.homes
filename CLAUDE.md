# 项目须知：SEO 发布安全

这个站的收入完全来自搜索流量（联盟返佣，见 README）。**任何改动都不得让页面从 Google / Bing 索引里掉出去**——URL 不需要隐藏，但必须稳定、可抓取，且每次部署都不能意外造成大面积掉索引。

## 硬性门禁

以下任一动作之后，部署前必须跑 `pnpm seo:check`（或直接 `pnpm verify`，已包含它）并拿到 `RELEASE_DECISION: READY`：

- 新增 / 修改文章
- 修改导航、网站结构
- 修改 SEO 配置（`astro.config.mjs`、`src/lib/site.ts`、`src/lib/schema.ts`）
- 修改 Cloudflare 部署文件（`public/_headers`、`public/_redirects`、`public/robots.txt`）
- 批量生成页面

如果 `pnpm seo:check` 返回 `BLOCKED`：**停止，不得 push，不得部署**。先修复问题、重新跑，全绿了再继续。不要为了让检查通过而放宽检查本身的判定标准。

`pnpm seo:check` 具体查什么、阈值怎么定，见 [README.md](README.md#seo-发布安全门禁) 与 `scripts/seo-gate.mjs` 文件头注释。部署完成后再跑一次 `pnpm seo:production`（对线上真实域名做只读抽查，本地检查查不出 Cloudflare 层面的 Bot Fight Mode / WAF 误伤 Googlebot、Bingbot 的问题）。

## 几条不允许违反的具体规则

- **已上线并进入 sitemap 的 URL 不允许无理由修改**。确需改动：同时做 301 重定向，并同步更新 canonical、sitemap、内部链接、导航、breadcrumb、schema。禁止直接删除旧 URL 让它变成死链。
- **不得给正常内容页（文章、专题页、品牌页、推荐页）加 `noindex`**。当前白名单仅三类：`404`、`/search/`（站内搜索结果页）、`/brands/[slug]` 里 `dataStatus: 'unverified'` 的品牌档案页（数据未核实前不放出去，见 `src/pages/brands/[slug].astro`）。加白名单之外的 noindex 属于阻断级问题。
- **`robots.txt` 通配组（`User-agent: *`）禁止出现 `Disallow: /`**，也不得让 Googlebot / bingbot 被单独分组屏蔽。当前策略是放行全部检索式与生成式引用类爬虫，只封纯训练类（GPTBot/ClaudeBot/CCBot 等），改动前先读 `public/robots.txt` 顶部的说明注释。
- **发现 dist 构建产物里出现不在 `src/pages`/`public` 登记范围内的未知目录**（`pnpm seo:check` 会自动报告）：这是被黑或误生成的信号，**只报告、不自动删除**，先确认来源。
- **不要为了完成任务而大规模重构正常代码、擅自更换框架、修改部署架构**。优先最小修改 + 自动检测，长期可维护。
- 内容扩张原则是质量优先于数量：新页面必须有独立搜索意图、不与现有页面抢词、有真实信息增量；发现关键词自相蚕食（cannibalization）优先合并/重构，而不是继续加相似页面。品牌页/城市页/年份页禁止只换关键词、正文机械复制。

## 现有检查体系（互不重复，各管一段）

| 命令                  | 职责                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm linkcheck`      | 站内死链、空 href                                                                                                              |
| `pnpm audit:site`     | H1/title/description/canonical/OG/JSON-LD 语法/图片 alt/标题层级/robots.txt 分组语法/sitemap-noindex 一致性/结构化数据模板泄漏 |
| `pnpm seo:check`      | noindex 白名单、canonical 自指、sitemap 与页面数基线异常、未知目录检测、核心 URL 抽查、标题去重——上面两个脚本没做的事          |
| `pnpm test`           | Vitest，页面级 SEO 契约（含孤岛页面检测：每篇文章必须至少被一处入链）                                                          |
| `pnpm seo:production` | 部署后对线上域名的只读抽查，本地检查覆盖不到的层（Cloudflare WAF/Bot Fight Mode 是否误伤真实爬虫）                             |

新增检查项时优先判断该放进哪一个，不要再开一个新脚本重复扫一遍 dist——除非确实是这几个都没覆盖的新维度。
