# 误挂的面板资料（不参与发布）

本目录存放**品牌归属错误**的测速面板资料。放在这里而不是删除，是为了保留处置记录。
下划线开头的目录不会被 `scripts/apply-panel-data.mjs` 与 `check-panel-duplicates.mjs` 读取。

## 处置记录

### kuaili-speedtest.jpg / kuaili.json — 2026-08-11

**问题**：这份 54 节点的测速导出与 `guangsu-yun-speedtest.jpg` 逐行完全相同——
同样的节点构成（香港 02–20 / 台湾 01–05 / 新加坡 01–10 / 日本 01–10 / 美国 01–10）、
同样的延迟与速度数值、同样的首节点 0B、同样的页脚（耗时 381s、Ping 5 次、消耗流量 19.4GB）。

**发现方式**：`scripts/check-panel-duplicates.mjs` 的数值指纹比对报出重复，随后人工逐行核对两张原图确认。

**裁定**：数据归属**光速云（guangsu-yun）**，由项目方于 2026-08-11 确认。
因此这份资料不属于快狸，已从 `measurements/panel/` 与 `public/images/brands/` 移出。

**后续**：快狸档案的 `images.speedtest` 已置空、`panelDisputed` 记录了原因，
在拿到快狸自己的测速导出之前，其档案页不展示任何面板数据与截图。

### yuzhou-yun-speedtest.jpg / yuzhou-yun.json — 2026-08-11

**问题**：这份 62 节点的测速导出与 `feimao-yun-speedtest.jpg` 逐行完全相同——
同样的 12 个地区构成、同样的账户信息行（剩余流量 109.97 GB、套餐到期 2026-03-28）、
同样的页脚（耗时 501s、Ping 5 次）。

**发现方式**：数值指纹比对 + 人工逐行核对两张原图。

**裁定**：数据归属**飞猫云（feimao-yun）**，由项目方于 2026-08-11 确认。

**后续**：宇宙云档案的 `images.speedtest` 已置空、`panelDisputed` 记录了原因，
在拿到宇宙云自己的测速导出之前，其档案页不展示任何面板数据与截图。

## 已补齐的替代数据

两家的面板**数据**均已由项目方补提供并转录发布，来自另一套测试工具（MiaoKo 自定义测试），
质量高于最初那批：**带完整时间戳，且都落在本站定义的晚高峰窗口（20:30–22:30）内**。

| 品牌   | 数据来源                                | 测试时间                | 规模             |
| ------ | --------------------------------------- | ----------------------- | ---------------- |
| 快狸   | MiaoKo 4.7.0 / 珠海联通 9Gbps / 32 线程 | 2026-08-05 20:35:24 CST | 50 节点 / 5 地区 |
| 宇宙云 | MiaoKo 4.6.4 / 珠海联通 9Gbps / 32 线程 | 2026-08-05 22:13:21 CST | 58 节点 / 7 地区 |

## 未决：两张截图文件

上述两图是以对话形式提供的，本地没有图片文件，因此两家的 `images.speedtest` 仍为空——
档案页有完整数据表，但没有截图。若要同时展示截图：

1. 把图片存到 `public/images/brands/<slug>-speedtest.jpg`（slug 为 `kuaili` / `yuzhou-yun`）
2. 跑 `node scripts/make-image-manifest.mjs`
3. 把该品牌 JSON 的 `images.speedtest` 设回 `/images/brands/<slug>-speedtest.jpg`
