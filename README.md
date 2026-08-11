# 机场决策室 — jichangtuijian.homes

中文机场选择决策平台：先讲标准，再谈推荐。Astro 静态站点，部署于 Cloudflare Pages。

## 技术栈

Astro 5（static 输出）· TypeScript（strict）· Tailwind CSS 4 · Content Layer（Markdown 文章 + JSON 品牌/作者数据）· Pagefind 本地搜索 · @astrojs/sitemap · @astrojs/rss · sharp。

## 常用命令

```bash
pnpm install        # 安装依赖
pnpm dev            # 本地开发（http://localhost:4321）
pnpm build          # 构建 + Pagefind 索引（产物在 dist/）
pnpm preview        # 预览构建产物
pnpm verify         # 一条命令跑完全部验收：build → 死链 → 全站审计 → 测试 → lint → 类型检查
pnpm audit:site     # 全站产物审计（H1/canonical/OG/JSON-LD/alt/sitemap 一致性等，需先 build）
pnpm check          # Astro/TS 类型检查
pnpm lint           # ESLint
pnpm test           # Vitest（SEO 契约测试，需先 build）
pnpm linkcheck      # 站内死链检查（需先 build）
pnpm format         # Prettier
```

**发布前只需要记住一条**：`pnpm verify`。它串起全部检查，任何一步失败都会中断——
`audit:site` 的退出码非 0 表示存在阻断级问题，不应部署。

## 目录结构

```
SITE-DNA.md                     品牌与设计决策源头（改设计先改这里）
INFORMATION-ARCHITECTURE.md     导航 / 栏目 / URL / 用户路径
SEO-STRATEGY.md                 关键词矩阵 / Pillar-Cluster / 页面契约
CONTENT-MAP.md                  内容类型模型 / 标杆清单 / 扩展计划
INTERNAL-LINK-MAP.md            内链与转化路径 / CTA 阶梯
UNIQUENESS-AUDIT.md             原创性审计
src/
  content/articles/<栏目>/      文章（目录名 = 栏目 = URL 前缀）
  content/brands/*.json         品牌档案数据（唯一商业链接出口）
  content/authors/*.json        作者（编辑部）
  content.config.ts             集合 Schema（frontmatter 契约）
  lib/site.ts                   站点常量 / 导航 / 栏目定义
  lib/schema.ts                 JSON-LD 构造
  layouts/  components/  pages/ 布局 / 组件 / 页面
scripts/check-links.mjs         死链检查
scripts/make-og.mjs             重新生成默认 OG 图
tests/seo.test.ts               页面级 SEO 契约测试
```

## 新增一篇文章

1. 在 `CONTENT-MAP.md` 登记选题（新 Intent/场景/人群/对比，禁止同义词换壳）。
2. 在 `src/content/articles/<栏目>/<slug>.md` 创建文件，URL 即 `/<栏目>/<slug>/`。
3. frontmatter 必填：title、description、pubDate、primaryKeyword、searchIntent、contentType、funnelStage；强烈建议：verdict（快速结论）、faq、related（内链，形如 `guides/how-to-choose`）。
4. 数据规则：没实测的数字一律不写，用「待验证」表述；评测类填 dataSource。
5. 更新 `src/lib/site.ts` 的 `LAST_SITE_UPDATE`。
6. `pnpm build && pnpm linkcheck && pnpm test` 通过后发布。

## 修改品牌数据 / Affiliate / 优惠码

品牌数据全部在 `src/content/brands/<slug>.json`，是全站唯一事实源。改一个字段，
首页速览、品牌库、排行榜、各专题名单页、档案页与评测页的 CTA 会同步变化。

- `affiliateUrl` / `officialUrl`：推广入口。填入后档案页与评测页 CTA 自动渲染外链（自动带 `rel="nofollow sponsored noopener"`）；为 `null` 时显示「官方入口核验中」。**全站任何其他文件禁止硬编码推广链接。**
- `priceFrom` / `pricePerGb` / `billingCycle`：价格。`pricePerGb` 驱动品牌库、排行榜与便宜机场页的排序，改价后务必同步重算。
- `couponCode` / `couponNote`：优惠码。改这里即可更新 `/airport-coupon/` 全表与所有 CTA。
- `claims.{ai,streaming}`：解锁口径（品牌宣称）。驱动 AI / 流媒体专题页的入选与解锁对照图；改后需重跑图表脚本。
- `scenarios[]`：场景标签（`ai` / `streaming` / `budget` / `iepl` / `newbie` / `longterm`），决定该品牌出现在哪些专题名单与品牌库筛选中。
- `facts[].status`：来源等级，三选一 —— `measured`（第三方公开数据）/ `sourced`（官方与渠道资料）/ `pending`（暂无统一测试数据）。
  **本站不做统一环境下的独立测速，因此没有「本站实测」这一档**，规则见 `/data-sources/`。
- 下架品牌：删除 JSON 文件，同时删除对应 `src/content/articles/reviews/<slug>.md`，并检查专题页 `slugs` 硬编码列表。

### 数据保鲜

对应 `/update-policy/` 的时效规则（价格 90 天、第三方公开数据 180 天）：

```bash
pnpm data:check   # 报告哪些引用来源已过期，过期即撤下或重新核对
```

### 第三方测速面板数据

渠道提供的测速面板截图不能直接当内容用——数字锁在图片里，搜索引擎读不到、用户无法比较。
流程是把它转录成结构化数据，再以「第三方公开数据」等级发布：

```bash
# 1. 转录：把面板图的数字写进 measurements/panel/<slug>.json（结构见任一现有文件）
# 2. 查重与体检（必跑）
node scripts/check-panel-duplicates.mjs
# 3. 写入品牌档案
node scripts/apply-panel-data.mjs --dry-run
node scripts/apply-panel-data.mjs
```

`check-panel-duplicates.mjs` 拦两类问题，**退出码非 0 即不应发布**：

- **数值指纹重复**：同一份导出被挂到多个品牌名下。这在实践中真的发生过，意味着至少一个品牌的数据是假的。
  写入脚本内建同样的查重，会自动跳过涉事品牌，不依赖人记住。
- **区间下限为 0**：面板里未测通的节点显示 `0ms / 0B`，直接取最小值会渲染成「延迟 0ms」。
  写入时这些下限会被剔除并告警，需人工排除失败节点后重新取值。

写入的数据行 status 一律是 `measured`（第三方公开数据，非本站执行）——本站不做统一测速，
不存在把这一档升级为「本站实测」的通道。

### 一次性与维护脚本

```bash
node scripts/seed-brands.mjs        # 一次性种子：由渠道资料生成品牌 JSON（已执行，勿重复运行覆盖人工修订）
node scripts/make-brand-charts.mjs  # 依据品牌 JSON 重新生成解锁对照图与线路示意图
node scripts/make-image-manifest.mjs # 重算品牌图片尺寸清单（新增/替换图片后必跑，防 CLS）
node scripts/make-og.mjs            # 重新生成默认 OG 图
```

### 品牌图片资产

`public/images/brands/` 下每个品牌三张：`<slug>-speedtest.jpg`（渠道提供的测速面板导出图）、
`<slug>-unlock.png`、`<slug>-topology.png`（后两张由脚本生成）。
三张图的来源与性质由 `src/components/BrandCharts.astro` 统一输出图注——
**替换图片时不要删除图注的来源说明**，这是数据来源政策的一部分。

## Cloudflare Pages 部署

| 配置项                 | 值                   |
| ---------------------- | -------------------- |
| Build command          | `pnpm build`         |
| Build output directory | `dist`               |
| 环境                   | Node 20+（默认即可） |

仓库已包含 `public/_headers`（安全响应头 + 缓存策略）与 `public/_redirects`
（www → 裸域、pages.dev 预览域 → 正式域、`/sitemap.xml` → `/sitemap-index.xml`），Cloudflare Pages 会自动识别。

**部署后核对清单**（这些只能在真实域名上验证，代码层无法自证）：

1. 自定义域名绑定 `jichangtuijian.homes`，并在 Cloudflare 控制台开启 **Always Use HTTPS**
2. 访问 `https://www.jichangtuijian.homes/` 确认 301 到裸域
3. 依次打开 `/sitemap-index.xml`、`/robots.txt`、`/rss.xml`、`/sitemap/`（HTML 版）
4. 访问 `/search/` 确认 Pagefind 索引已随产物部署
5. 随便敲一个不存在的路径，确认返回自定义 404 页
6. 用浏览器开发者工具确认 `_headers` 生效（响应头含 `X-Content-Type-Options`）

canonical、sitemap、OG 图均已硬绑定正式域名（`astro.config.mjs` 的 `site` 字段）。

### 站长平台与 IndexNow

三项都是**部署后**的手动操作，代码侧已留好接口：

| 事项 | 操作 |
|---|---|
| Google Search Console | 取得验证码后填 `src/lib/site.ts` 的 `SITE_VERIFICATION.google`，重新部署即可；也可改用 DNS 验证并保持留空。随后提交 `https://jichangtuijian.homes/sitemap-index.xml` |
| Bing Webmaster Tools | 同理填 `SITE_VERIFICATION.bing`（对应 `msvalidate.01`），提交同一个 sitemap |
| IndexNow | 生成 8–128 位十六进制密钥 → 填 `INDEXNOW_KEY` → 在 `public/<key>.txt` 放同名文件（内容即密钥）→ 跑 `node scripts/indexnow-submit.mjs`。先用 `--dry-run` 看一遍要提交什么 |

留空时不会输出任何空 meta 标签，所以未配置也不会污染页面。
