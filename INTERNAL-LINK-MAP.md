# INTERNAL-LINK-MAP — jichangtuijian.homes

> 内链是转化链路的骨架。方向：知识 → 标准 → 场景 → 对比 → 评测 → 品牌档案（唯一商业层）。

## 1. 主转化链

```
/learn/iplc-vs-iepl/            IPLC 和 IEPL 有什么不同（知识）
        ↓
/guides/how-to-choose/          机场怎么选（标准）
        ↓
/guides/stability-signals/      稳定性怎么核验（标准细化）
        ↓
/best/ai/ 或 /best/budget/      我的场景该用哪类（场景）
        ↓
/vs/wgetcloud-vs-nexitally/     两个候选怎么比（对比）
        ↓
/reviews/wgetcloud/             这个到底怎么样（评测）
        ↓
/brands/wgetcloud/              档案 / 套餐 / 官方入口（商业承接）
```

## 2. 支线

- 教程支线：/apps/clash-guide/ ↔ /apps/shadowrocket-guide/ → /fix/nodes-all-timeout/ →（解决后）/guides/stability-signals/。
- 风险支线：/risk/exit-scam-signals/ → /guides/how-to-choose/（"怎么选到不跑路的"）→ /best/budget/（低价风险段互链）。
- 协议支线：/learn/protocols-explained/ → /learn/iplc-vs-iepl/ → /guides/how-to-choose/。

## 3. 每篇文章内链契约

| 页面                      | 必须链出                                                        | 必须被链入                  |
| ------------------------- | --------------------------------------------------------------- | --------------------------- |
| how-to-choose             | stability-signals, best/ai, best/budget, risk/exit-scam-signals | 首页、所有 best、learn 两篇 |
| stability-signals         | how-to-choose, risk/exit-scam-signals, vs 对比                  | how-to-choose, fix          |
| best/ai                   | how-to-choose, learn/iplc-vs-iepl, reviews/wgetcloud            | 首页, how-to-choose         |
| best/budget               | how-to-choose, risk/exit-scam-signals, stability-signals        | 首页, how-to-choose         |
| reviews/wgetcloud         | brands/wgetcloud, vs 对比, methodology                          | best/ai, vs                 |
| vs/wgetcloud-vs-nexitally | 两品牌 reviews+brands, how-to-choose                            | best, reviews               |
| apps/*                    | fix/nodes-all-timeout, 另一篇 apps                              | 首页, learn                 |
| learn/*                   | guides, 另一篇 learn                                            | apps, best                  |
| fix/nodes-all-timeout     | apps 两篇, stability-signals                                    | apps, 首页                  |
| risk/exit-scam-signals    | how-to-choose, best/budget, update-policy                       | 首页, guides, best/budget   |
| brands/*                  | 对应 review, methodology, disclaimer                            | reviews, vs                 |

孤岛检查：build 后由 linkcheck + SEO 检查执行，任何可索引页面入链数为 0 视为不通过。

## 3.5 品牌矩阵上线后的主转化链（2026-08-11）

```
知识 / 故障            /learn/*  /fix/*
        ↓
选择标准               /guides/how-to-choose/  /guides/stability-signals/
        ↓
场景标准               /best/ai/   /best/budget/
        ↓
场景名单（承接层）      /chatgpt-airport/  /streaming-airport/  /cheap-airport/
                       /iepl-airport/  /clash-airport/  /shadowrocket-airport/
        ↓
横向比较               /airport-ranking/   /brand-library/   /airport-coupon/
        ↓
单品牌评测             /reviews/<slug>/        （16 篇）
        ↓
品牌档案（唯一外链层）  /brands/<slug>/         （16 家 + 2 家观察）
        ↓
官网入口（affiliate，rel="nofollow sponsored"）
```

关键约束：

- **名单页与标准页必须成对互链**，并在正文首段声明分工（名单页说"这一页给名单，标准见 X"，标准页反之）。
- 每篇品牌评测必须链到：自身档案页（由 `brandCta` 自动渲染）、≥1 篇同价位其他品牌评测、≥1 个标准页。
- 每个品牌档案页必须链到：排行榜、品牌库、稳定性清单、跑路信号清单（侧栏「交叉验证」模块固定输出）。
- 首页承担第一跳分流：决策路径 6 条 + 场景直达 6 个 + 在库速览表 8 行。

## 4. CTA 阶梯（按 Funnel Stage）

| 阶段      | CTA 文案模式                         | 落点                                     |
| --------- | ------------------------------------ | ---------------------------------------- |
| 知识/教程 | 「继续了解：…」「下一步：…」         | 站内下一层                               |
| 选择/场景 | 「查看对比」「查看评测」             | /vs/ /reviews/                           |
| 评测      | 「查看 XX 档案与套餐信息」           | /brands/<slug>/                          |
| 品牌档案  | 「前往官方网站（外链，可能含推广）」 | affiliateUrl/officialUrl（品牌数据驱动） |

商业链接唯一出口：`src/content/brands/*.json` + `BrandCTA` 组件。任何 .md/.astro 中不得硬编码推广外链。
