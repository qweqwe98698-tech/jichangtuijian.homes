# SEO-STRATEGY — jichangtuijian.homes

> 关键词领地：**机场选择决策 / 场景推荐 / 深度评测 / 对比 / 风险判断**。
> 技术百科与教程为上游流量与 Topic Authority 服务，不与决策内容争夺同一 Intent。

## 1. Pillar / Cluster 体系

| Pillar     | Pillar Page                             | Cluster（现有 → 规划）                                                  |
| ---------- | --------------------------------------- | ----------------------------------------------------------------------- |
| 机场选择   | /guides/（Hub）+ /guides/how-to-choose/ | stability-signals → 便宜怎么选、高端适合谁、线路判断、套餐选择          |
| 场景推荐   | /best/                                  | ai、budget → stable、premium、streaming、iplc                           |
| 评测       | /reviews/                               | wgetcloud → 每品牌一篇                                                  |
| 对比       | /vs/                                    | wgetcloud-vs-nexitally → 高频品牌两两对比                               |
| 客户端     | /apps/                                  | clash-guide、shadowrocket-guide → v2rayN、各平台                        |
| 协议与线路 | /learn/                                 | iplc-vs-iepl、protocols-explained → 各协议单篇、原生 IP、流媒体解锁原理 |
| 故障排查   | /fix/                                   | nodes-all-timeout → 订阅失败、ChatGPT 打不开、Netflix 不解锁、晚高峰慢  |
| 风险观察   | /risk/                                  | exit-scam-signals → 长周期套餐风险、运营状态判断                        |

## 2. 关键词矩阵（页面 ↔ 关键词唯一对应，禁止互相蚕食）

### 核心商业词（decision / commercial intent）

| 关键词                                 | 页面                                                            | Funnel                 |
| -------------------------------------- | --------------------------------------------------------------- | ---------------------- |
| 机场推荐 / 2026 机场推荐 / 机场怎么选  | /guides/how-to-choose/ + 首页                                   | consideration→decision |
| 稳定机场推荐 / 稳定机场怎么看          | /guides/stability-signals/（后接 /best/stable/）                | consideration          |
| 便宜机场 / 高性价比机场                | /best/budget/                                                   | decision               |
| 高端机场 / IPLC 机场 / IEPL 机场       | 规划 /best/premium/ /best/iplc/（当前由 iplc-vs-iepl 承接上游） | decision               |
| 机场评测 / XX 机场怎么样 / XX 机场评测 | /reviews/<brand>/                                               | decision               |
| XX 机场 vs YY 机场                     | /vs/<a>-vs-<b>/                                                 | decision               |
| XX 机场官网 / 套餐                     | /brands/<slug>/                                                 | transaction            |

### 场景词

| 关键词                                   | 页面                         |
| ---------------------------------------- | ---------------------------- |
| ChatGPT 机场 / Claude 机场 / AI 机场     | /best/ai/                    |
| Netflix 机场 / 流媒体机场 / 原生 IP 机场 | 规划 /best/streaming/        |
| Clash 机场 / Clash 订阅                  | /apps/clash-guide/（工具词） |

### 技术知识词（informational，上游）

IPLC 是什么 / IEPL 是什么 → /learn/iplc-vs-iepl/；VLESS、VMess、Trojan、Hysteria2、Shadowsocks 区别 → /learn/protocols-explained/（后续每协议拆单篇承接"XX 是什么"）。

### 问题解决词（problem intent）

节点全部超时 / 机场连不上 → /fix/nodes-all-timeout/；Clash 订阅失败、Shadowrocket 超时、ChatGPT 无法访问、Netflix 不解锁、晚高峰慢 → /fix/ 规划单篇。

### 风险词

机场跑路 / 机场跑路前兆 / 机场靠谱吗 → /risk/exit-scam-signals/。

## 3. 页面级 SEO 契约

每个可索引页面在 frontmatter 中必须声明：`primaryKeyword`、`secondaryKeywords`、`searchIntent`、`contentType`、`funnelStage`，并保证：

- Title：主词前置，≤30 中文字符，站名后缀「｜机场决策室」。
- Description：120–155 字符，含主词 + 一个行动理由。
- H1 唯一且 ≠ Title 逐字复制。
- 每页 ≥3 条站内出链、≥1 条被内链（无孤岛，见 INTERNAL-LINK-MAP.md）。

**已知待优化项（2026-08-11 记录）**：当前多数页面的 Description 为 110–150 个中文字符，
而中文搜索结果的摘要通常在 78–80 字左右截断。所有 Description 均已把主关键词与核心价值前置，
因此截断不影响关键信息呈现，但后续优化时应把长度压到 75 字以内，尾部信息移入正文。
这属于打磨项而非阻塞项，不影响索引与排名基础。

## 4. GEO（生成式引擎优化）表达规范

- 每篇文章开头：Verdict Box 用 ≤3 句直接回答主 Intent（可独立摘录）。
- 结构化模块按需用：定义块、步骤、取舍表、Checklist、FAQ（仅真实问题，3–6 条）。
- 全文可引用性：每个 H2 下第一段独立成立，不依赖上文指代。
- 数据句必须带验证状态或时间（"截至 2026-08 待验证"），供引擎引用时保留限定语。
- 禁止为 GEO 把文章拆成 FAQ 海。自然阅读优先。

## 5. Schema 策略

- 全站：Organization + WebSite（首页注入）。
- 所有页面：BreadcrumbList。
- 文章：Article（含 datePublished/dateModified/author）。
- 有真实 FAQ 的文章：FAQPage。
- 逐步教程（apps/fix 且步骤完整）：HowTo（当前 clash/shadowrocket 教程符合）。
- 排名类推荐页：ItemList（/best/ 文章符合时）。
- 禁止无对应可见内容的 Schema。

## 6.5 商业专题页矩阵（2026-08-11 扩建）

品牌库上线后新增的商业承接层。分工原则：**标准页讲怎么判断（/best/、/guides/），名单页讲有哪些（专题页）**，
两者互链并在正文中写明分工，避免同义词内耗。

| URL                        | 主关键词                                  | 次要词                                                 | 承接来源                         |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------ | -------------------------------- |
| /airport-ranking/          | 机场排行榜 / 2026 机场排行榜 / 机场天梯榜 | 机场排名、机场推荐排行榜、机场测评排行榜               | 首页、主导航                     |
| /brand-library/            | 机场品牌库 / 机场推荐大全                 | 机场对比表、机场价格对比、机场汇总                     | 首页、主导航、全部专题页         |
| /cheap-airport/            | 便宜机场推荐                              | 低价机场、平价机场、学生党机场、10/15/20 元机场        | 首页、排行榜、优惠码页           |
| /chatgpt-airport/          | ChatGPT 机场推荐                          | AI 机场、Claude 机场、Gemini 机场、OpenAI 机场         | 首页、/best/ai/                  |
| /streaming-airport/        | 流媒体解锁机场                            | Netflix 机场推荐、Disney+ 机场、奈飞机场               | 首页、品牌库                     |
| /iepl-airport/             | IEPL 机场推荐 / 专线机场推荐              | IPLC 机场、企业级专线机场、真专线机场                  | 首页、/learn/iplc-vs-iepl/       |
| /clash-airport/            | Clash 机场推荐                            | Clash 订阅推荐、支持 Clash 的机场、Clash 节点推荐      | 首页、/apps/clash-guide/         |
| /shadowrocket-airport/     | Shadowrocket 机场推荐                     | 小火箭机场、iPhone 机场推荐、iOS 机场推荐              | 首页、/apps/shadowrocket-guide/  |
| /v2rayn-airport/           | v2rayN 机场推荐                           | Windows 机场推荐、电脑机场推荐、v2rayN 订阅推荐        | 首页、/clash-airport/            |
| /pay-as-you-go-airport/    | 按量计费机场                              | 不限时机场、流量包机场、一次性套餐、永久流量           | 首页、便宜机场页                 |
| /free-trial-airport/       | 免费试用机场                              | 一元试用机场、支持试用的机场、机场试用注意事项         | 首页、/free/                     |
| /best/stable/              | 稳定机场推荐                              | 稳定机场排行榜、靠谱机场推荐、晚高峰稳定机场           | 首页、/guides/stability-signals/ |
| /airport-coupon/           | 机场优惠码                                | 机场折扣码、机场优惠活动、机场促销                     | 首页 Footer、便宜机场页          |
| /brands/&lt;slug&gt;/ ×16  | 品牌名 + 官网 / 套餐 / 优惠码             | 品牌名机场、品牌名注册、品牌名价格                     | 全部名单页                       |
| /reviews/&lt;slug&gt;/ ×16 | 品牌名怎么样                              | 品牌名评测、品牌名好用吗、品牌名值得买吗、品牌名安全吗 | 品牌档案、名单页                 |

内耗防护：

- 「便宜机场推荐」由 /cheap-airport/ 承接（名单+价格表），「便宜机场怎么选」由 /best/budget/ 承接（标准+代价清单），两页开头互相声明分工。
- 「ChatGPT 机场推荐」由 /chatgpt-airport/ 承接，「AI 场景怎么判断」由 /best/ai/ 承接，同上。
- 「IEPL 机场推荐」由 /iepl-airport/ 承接，「IPLC 是什么」由 /learn/iplc-vs-iepl/ 承接。
- 品牌词一律拆两页：档案页吃「官网/套餐/优惠码/价格」，评测页吃「怎么样/评测/值不值」。
- 「稳定机场推荐」由 /best/stable/ 承接（代理指标筛选名单），「稳定性怎么核验」由 /guides/stability-signals/ 承接（七项指标与测法）。
- 「免费试用机场」由 /free-trial-airport/ 承接（试用清单与替代路径），「免费节点安不安全」由 /free/ 承接（免费方案的真实成本）。
- 「v2rayN 机场推荐」与「Clash 机场推荐」拆两页：前者面向 V2Ray 系协议与 Windows，后者面向规则分流与 mihomo 生态，两页互链并说明分工。

## 6.55 P1 引流内容三系列（2026-08-11 扩建）

场景与平台词的流量入口层。定位是**先解决问题、再引向决策页**：这些页面承接的是问题意图，
用户此刻要的是解法不是名单，所以商业引导只放在文末的「换机场之前先确认」段落里。

| 系列   | URL                                | 主关键词            | 与既有页面的分工                                                                   |
| ------ | ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| AI     | /fix/claude-code-disconnect/       | Claude Code 断流    | ChatGPT 通用排查在 /fix/chatgpt-blocked/，本页只写 Claude 特有的长任务与登录态问题 |
| AI     | /fix/gemini-region-error/          | Gemini 地区不支持   | 同上，Gemini 特有的登录与区域判定                                                  |
| AI     | /apps/ai-split-tunneling/          | AI 域名分流         | 操作层缺口：/best/ai/ 讲「要固定出口」，本页讲「怎么配」                           |
| 流媒体 | /learn/streaming-unlock-explained/ | 流媒体解锁原理      | /streaming-airport/ 只给简表，本页给完整判定链路与失效机制                         |
| 流媒体 | /fix/disney-plus-not-working/      | Disney+ 无法播放    | 平台特有，与 Netflix 页并列不重叠                                                  |
| 流媒体 | /learn/netflix-region-library/     | Netflix 地区怎么选  | 片库与地区选择，不与解锁排查重叠                                                   |
| Google | /fix/google-search-blocked/        | Google 打不开       | 全新领域，站内此前零覆盖                                                           |
| Google | /fix/youtube-buffering/            | YouTube 卡顿        | 与 /fix/peak-hour-slow/ 分工：通用带宽问题链过去，本页写 YouTube 特有              |
| Google | /learn/google-services-guide/      | Google 服务网络要求 | 解释「同为 Google 为何表现不同」，承接 Gmail/Drive/Play/学术 一批长尾              |

内耗防护：三系列均为**问题意图**，与商业名单页（/chatgpt-airport/、/streaming-airport/）的
**决策意图**分离；每篇开头明示与既有页面的分工，避免同一 Intent 被两页争夺。

## 6.6 GEO 结构化覆盖

- 首页、品牌库、排行榜、全部专题页、全部品牌档案页均输出 FAQPage（问题取自长尾问题库，答案先给结论）。
- 排行榜与品牌库输出 ItemList；文章输出 Article；教程输出 HowTo；全站 BreadcrumbList。
- 每个 FAQ 答案独立成立、可直接摘录，且都带限定语（「渠道资料口径」「本站未复测」），
  确保被生成式引擎引用时保留数据边界。

## 7. 扩展纪律

新文章必须新增至少一个维度（新 Intent / 新场景 / 新人群 / 新对比 / 新数据 / 新决策阶段），进入 CONTENT-MAP.md 登记后才可动笔；同義词换壳文章（"最好/靠谱/便宜"互换）一律拒绝。
