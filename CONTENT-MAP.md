# CONTENT-MAP — jichangtuijian.homes

> 内容类型模型、标杆内容清单与扩展计划。新选题必须先登记再动笔。

## 1. 内容类型（Search Intent 动态模型）

| contentType                | 结构骨架                                                                                          | 适用栏目            |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| recommendation 推荐选择型  | 选择标准 → 用户场景 → 分需求推荐 → 方案区别 → 风险 → 最终选择方法                                 | guides, best        |
| review 深度评测型          | 品牌背景 → 资料来源 → 评测方法 → 线路/套餐 → 场景表现 → 优点/局限 → 适合/不适合 → 风险 → 最终判断 | reviews             |
| comparison 对比型          | 快速结论 → 核心区别 → 维度对比 → 分场景 → 谁选 A/谁选 B → 如何决定                                | vs, learn(概念对比) |
| tutorial 教程型            | 适合谁 → 准备 → 步骤 → 验证 → 常见错误 → Troubleshooting → 下一步                                 | apps                |
| wiki 百科型                | 定义 → 原理 → 结构 → 场景 → 优点 → 限制 → 误解                                                    | learn               |
| troubleshooting 问题解决型 | 快速答案 → 判断现象 → 原因 → 排查顺序 → 解决 → 仍失败怎么办                                       | fix                 |
| risk 风险观察型            | 发生了什么/信号 → 如何判断 → 影响 → 降低风险 → 后续观察                                           | risk                |

同类型文章 H2 数量与措辞不得逐篇复制（批量审查抽样点）。

## 2. 标杆内容（12 篇，全部完成后才允许批量扩展）

| #   | URL                         | 类型             | Intent                   | 主词                    |
| --- | --------------------------- | ---------------- | ------------------------ | ----------------------- |
| 1   | /guides/how-to-choose/      | recommendation   | commercial               | 机场怎么选 / 机场推荐   |
| 2   | /guides/stability-signals/  | recommendation   | commercial               | 稳定机场                |
| 3   | /best/ai/                   | recommendation   | commercial               | AI 机场 / ChatGPT 机场  |
| 4   | /best/budget/               | recommendation   | commercial               | 便宜机场 / 高性价比机场 |
| 5   | /reviews/wgetcloud/         | review           | commercial-investigation | WgetCloud 怎么样        |
| 6   | /vs/wgetcloud-vs-nexitally/ | comparison       | commercial-investigation | WgetCloud vs Nexitally  |
| 7   | /apps/clash-guide/          | tutorial         | informational            | Clash 使用教程          |
| 8   | /apps/shadowrocket-guide/   | tutorial         | informational            | Shadowrocket 教程       |
| 9   | /learn/iplc-vs-iepl/        | comparison(wiki) | informational            | IPLC IEPL 区别          |
| 10  | /learn/protocols-explained/ | wiki             | informational            | VLESS VMess Trojan 区别 |
| 11  | /fix/nodes-all-timeout/     | troubleshooting  | problem                  | 节点全部超时            |
| 12  | /risk/exit-scam-signals/    | risk             | informational→trust      | 机场跑路信号            |

## 3. 数据真实性规则

- 测速/延迟/带宽/价格/节点数/解锁状态：一律走「数据行 + 验证戳」模块，无实测则标 `◌ 待验证`，禁止编造。
- 品牌事实（成立时间/公司/运营状态）：只写有公开依据的定位描述，其余标待验证。
- frontmatter `lastVerified` 记录最近核验日期；评测类必须有 `dataSource` 说明。

## 3.5 品牌矩阵（2026-11-12 同步）

在库动态品牌档案（含早期观察品牌 `wgetcloud`、`nexitally` 及扩展渠道品牌共 30+ 家），核心品牌配备「品牌档案页 + 深度评测」；其中首批评测 16 家配有渠道参考图表，新增评测含 `reviews/weifeng-wangluo`、`reviews/wuyou-lianjie` 等。关键在校对字段：

| slug          | 品牌     | 起步价口径（核对态）  | 优惠码    | 场景标签                      |
| ------------- | -------- | --------------------- | --------- | ----------------------------- |
| weitu-yun     | 唯兔云   | 14.9 元 / 月 · 100GB  | weitu666  | budget, newbie                |
| guangsu-yun   | 光速云   | 99 元 / 年 · 59GB/月  | AMM       | ai, streaming, iepl, longterm |
| feimao-yun    | 飞猫云   | 约 7 元 / 月 · 50GB   | flycat888 | budget, ai, streaming, newbie |
| weifeng-wangluo | 微风网络 | 约 7 元 / 月 · 50GB | flat888   | budget, iepl, newbie          |
| wuyou-lianjie | 无忧链接 | 19 元 / 月 · 100GB    | wuyou666  | mid, iepl, ai, streaming      |

注：其余 13+ 篇早期已同步评测与扩展档案以 `src/content/brands/*.json` 实盘字段为唯一事实源。

### 品牌图表的三种性质（写作时必须区分）

| 图             | 文件                   | 性质                 | 图注要求                     |
| -------------- | ---------------------- | -------------------- | ---------------------------- |
| 测速面板导出图 | `<slug>-speedtest.jpg` | 渠道提供，非本站复测 | 注明测试网络/时段/线程数未知 |
| 解锁能力对照   | `<slug>-unlock.png`    | 依品牌宣传口径生成   | 注明本站未复测、随 IP 池变动 |
| 线路结构示意   | `<slug>-topology.png`  | 架构示意，无性能数据 | 注明非实测路由               |

图表由 `scripts/make-brand-charts.mjs` 依据品牌 JSON 的 `claims` / `lineTypes` 生成，改数据后重跑即可同步。

## 4. 扩展计划（按优先级）

**第二批（场景推荐补全）**：✅ /best/stable/、/best/premium/ 均已上线。
场景类商业词已由专题页承接（见 SEO-STRATEGY §6.5），/best/streaming/ 与 /best/iplc/ 不再单独建页，避免与 /streaming-airport/、/iepl-airport/ 内耗，并在 /best/ 中直接卡片引导。
**第三批（问题解决长尾）**：✅ 已上线 subscription-update-fail、wifi-ok-cellular-fail、chatgpt-blocked、peak-hour-slow、netflix-not-unlocking、v2rayn-cannot-connect；待办 shadowrocket-timeout、clash-verge-startup-fail。
**第四批（协议与 IP 知识）**：✅ 已上线 learn/airport-vs-vpn、learn/native-ip、learn/traffic-multiplier、learn/streaming-unlock-explained；待办 shadowsocks、trojan、vmess、vless、hysteria2 各「是什么」承接页。
**第六批（P1 平台引流三系列，2026-08-11）**：✅ AI 系列 fix/claude-code-disconnect、fix/gemini-region-error、apps/ai-split-tunneling；流媒体系列 learn/streaming-unlock-explained、fix/disney-plus-not-working、learn/netflix-region-library；Google 系列 fix/google-search-blocked、fix/youtube-buffering、learn/google-services-guide。分工与内耗防护见 SEO-STRATEGY §6.55。
后续可扩：HBO Max / Hulu / Apple TV+ 各自平台页、TikTok 原生 IP 与多账号、Telegram 连接问题。
**第 4.5 批（品牌对比）**：✅ 已上线 5 组同价位对比（见 /vs/）；后续按品牌新增补齐两两组合，每组必须有真实差异点才建页。
**第五批（品牌扩展）**：每新增品牌 = 品牌档案 + 深度评测 + 至少一组对比，三件套齐才上线。
**持续（风险观察）**：风险牌数据行按 update-policy 周期核查。
