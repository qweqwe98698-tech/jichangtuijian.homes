# INFORMATION-ARCHITECTURE — jichangtuijian.homes

> 依据 SITE-DNA.md 推导。URL 一经收录不得随意改动；调整必须走 301 + canonical + sitemap + 内链四步。
> trailingSlash: always。全部小写、短、语义化、无日期、无参数。

## 1. 站点结构总览

```
/                         首页（决策引导索引）
/guides/                  开始选择（Pillar Hub：机场怎么选）
/best/                    场景推荐 Hub
  /best/ai/               AI 工具场景推荐
  /best/budget/           便宜/高性价比场景
  （后续：/best/stable/ /best/premium/ /best/streaming/ /best/iplc/）
/reviews/                 深度评测 Hub
  /reviews/wgetcloud/     品牌深度评测（示例首篇）
/vs/                      机场对比 Hub
  /vs/wgetcloud-vs-nexitally/
/apps/                    客户端教程 Hub
  /apps/clash-guide/ /apps/shadowrocket-guide/
/learn/                   代理知识库 Hub
  /learn/iplc-vs-iepl/ /learn/protocols-explained/
/fix/                     故障排查 Hub
  /fix/nodes-all-timeout/
/risk/                    风险观察 Hub（含风险牌板块）
  /risk/exit-scam-signals/
/free/                    免费资源与风险说明（单页，非空壳栏目）
/brands/                  品牌档案索引
  /brands/<slug>/         品牌档案页（数据 + 验证状态 + 商业承接）
/search/                  Pagefind 全站搜索
/about/                   关于本站
/authors/editorial/       编辑部页面（作者实体）
/editorial-policy/        编辑政策
/methodology/             资料核验方法
/data-sources/            数据来源
/update-policy/           更新政策
/disclaimer/              免责声明
/privacy/                 隐私政策
/contact/                 联系方式
/404                      未找到
/rss.xml  /sitemap-index.xml  /robots.txt
```

## 1.5 商业承接层（2026-08-11 扩建）

在栏目 Hub 之上新增一层「名单 / 对照」页，直接承接高商业意图关键词：

```
/airport-ranking/          2026 机场排行榜（三份可复算的榜）
/brand-library/            机场品牌库（16 家全对照 + 场景筛选）
/cheap-airport/            便宜机场推荐（价格对照表）
/chatgpt-airport/          ChatGPT / AI 机场名单
/streaming-airport/        流媒体解锁机场名单
/iepl-airport/             IEPL 专线机场名单 + 三种验证法
/clash-airport/            Clash 机场推荐
/shadowrocket-airport/     Shadowrocket / iPhone 机场推荐
/v2rayn-airport/           v2rayN / Windows 机场推荐
/pay-as-you-go-airport/    按量计费与不限时机场
/free-trial-airport/       免费试用机场（含无名单时的替代路径）
/airport-coupon/           机场优惠码汇总
/brands/<slug>/            品牌档案 ×18（唯一外链层）
```

分层原则：**标准页（/guides/ /best/）讲怎么判断 → 名单页讲有哪些 → 品牌档案给入口**。
名单页与对应标准页必须成对互链并在首段声明分工。

## 2. 主导航（报头行，≤7 项）

机场排行榜 · 品牌库 · 开始选择 · 场景推荐 · 机场评测 · 客户端教程 · 风险观察 ＋ 搜索入口

- 商业承接页（排行榜、品牌库）前置，因为它们承接商业意图最强的关键词。
- `/vs/`（机场对比）、`/learn/`（知识库）、`/fix/`（故障排查）不进主导航：从移动端展开菜单、Footer 与文章内链进入。
- 其余名单页（便宜 / AI / 流媒体 / 专线 / 各客户端 / 按量 / 试用 / 优惠码）：首页「按场景直达」模块 + Footer 进入。
- `/free/`、`/brands/`、信任页：Footer 进入。
- 顶部细字信息行：站点最近更新日期 + 编辑政策 + 数据来源 链接（信任前置）。

## 3. 首页模块顺序（按用户任务频率 × 商业价值排序）

1. **决策引导索引（开版）**：左栏 6 条决策路径（新手怎么选 / 要稳定 / 要便宜 / 看流媒体 / 用 AI / 怕跑路），每条一句判断标准 + 入口；右栏"研究室日志"（最近更新记录行）。
2. **选择方法摘要**：三步选择法（定场景 → 核标准 → 查风险），链向 /guides/ Pillar。
3. **本期重点评测与对比**：编辑排名式列表（非卡片网格），含验证戳。
4. **知识库与教程入口**：按"你现在卡在哪一步"组织（不会选 / 不会用 / 连不上）。
5. **风险牌摘要**：最近核查的风险状态行，链向 /risk/。
6. **本站怎么工作**：编辑政策 / 资料核验方法 / 数据来源 三链接 + 一句免责。

## 4. 用户路径映射（7.2 任务 → 入口）

| 用户任务           | 入口                         | 落点               |
| ------------------ | ---------------------------- | ------------------ |
| 我不知道怎么选     | 首页路径①、主导航"开始选择"  | /guides/           |
| 我想直接看推荐     | 首页路径②③、主导航"场景推荐" | /best/             |
| 我想比较           | 主导航"机场对比"             | /vs/               |
| 我想看某机场怎么样 | 主导航"机场评测"、品牌档案   | /reviews/ /brands/ |
| 我不会用客户端     | 主导航"客户端教程"           | /apps/             |
| 我想了解协议线路   | 主导航"知识库"               | /learn/            |
| 我担心跑路         | 首页路径⑥、主导航"风险观察"  | /risk/             |
| 我连不上了         | 教程 Hub / Footer / 文章内链 | /fix/              |

## 5. 面包屑

`首页 › 栏目 › 文章`。全站输出 BreadcrumbList Schema。Hub 页：`首页 › 栏目`。

## 6. 内容路由实现

- 文章统一存于 `src/content/articles/`，frontmatter `section` 决定栏目（guides/best/reviews/vs/apps/learn/fix/risk）。
- 动态路由 `src/pages/[section]/[slug].astro` 按 section 校验生成。
- Hub 页为手工页面（`src/pages/<section>/index.astro`），各自有独立编辑逻辑，禁止共用同一 Hub 模板渲染。
- 品牌档案 `src/content/brands/*.json` → `/brands/[slug]/`。

## 7. 转化路径（IA 层）

知识（/learn/ /fix/）→ 选择标准（/guides/）→ 场景推荐（/best/）→ 对比（/vs/）→ 评测（/reviews/）→ 品牌档案（/brands/，唯一放商业链接的层）。

商业链接只出现在品牌档案页与评测页的 CTA 组件中，全部经由品牌数据文件（src/content/brands/）驱动，禁止散落硬编码。
