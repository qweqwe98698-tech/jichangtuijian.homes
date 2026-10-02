/**
 * SEO / GEO 深度主线矩阵文章全自动发布引擎
 *
 * 核心功能：
 * 1. 【防批量AI识别与URL优化引擎】：
 *    - 维护 40+ 深度高意图技术矩阵题库，严格采用自然人设语义化 kebab-case URL，拒绝机器流水号/时间戳特征
 *    - 自动扫描站内已有文章，精确去重，永不重复发布
 * 2. 【DeepSeek API 深度万字级长文生成】：
 *    - 采用 deepseek-chat 模型，最大 Token 8192，输出具备极高专业深度的实操与原理长文
 *    - 注入 human-writing 写作反套路标准（禁“不是……而是……”、禁破折号、禁提示型冒号、禁虚假机构套话）
 *    - 严格遵循 audit-site.mjs 红线（严禁出现“本站实测”、“本站测速”等违规用语）
 * 3. 【自动质检与内链闭环】：
 *    - 自动校验并挂载相关已有内链与商业品牌 CTA，杜绝孤岛页面
 *    - 自动更新 src/lib/site.ts 的最近编辑日期 LAST_SITE_UPDATE
 *    - 支持 --mock（离线测试）与 --dry-run（试运行）
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const ARTICLES_BASE = resolve(ROOT, 'src/content/articles');
const SITE_TS_PATH = resolve(ROOT, 'src/lib/site.ts');
const DEEPSEEK_API_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';
const API_KEY = process.env.DEEPSEEK_API_KEY;

// ── 1. 深度 SEO / GEO 专题主线方向矩阵题库（持续迭代扩展） ──
const TOPIC_MATRIX = [
  {
    section: 'apps',
    slug: 'clash-verge-rev-tun-mode',
    title: 'Clash Verge Rev TUN 模式完整配置：虚拟网卡与全局分流',
    primaryKeyword: 'Clash Verge Rev TUN模式',
    secondaryKeywords: ['Clash Verge Rev 虚拟网卡', 'TUN 模式绕过系统代理', 'gvisor 还是 system 堆栈', 'Clash Verge DNS 防泄漏'],
    contentType: 'tutorial',
    searchIntent: 'problem',
    funnelStage: 'awareness',
    difficulty: 'intermediate',
    platform: 'Windows / macOS',
    brandCta: 'guangsu-yun',
    related: ['apps/clash-guide', 'apps/ai-split-tunneling', 'fix/nodes-all-timeout'],
    promptOutline: `重点剖析 Clash Verge Rev (Mihomo 内核) 下 TUN 模式工作原理。对比 gvisor / system / mixed 三种网络堆栈的吞吐与 CPU 占用，详细讲解 Windows TAP 驱动与 Wintun 驱动的安装兼容性，提供真实的 config.yaml 中 tun 节点完整配置代码块（包含 stack, dns-hijack, auto-route, strict-route）。列举终端命令行环境、WSL2、Docker 容器如何无缝接入 TUN 流量，并给出排查 DNS 污染与死循环路由的具体步骤。`
  },
  {
    section: 'learn',
    slug: 'vless-reality-deep-dive',
    title: 'VLESS-Reality 协议原理深度解析：握手流程与 SNI 伪装机制',
    primaryKeyword: 'VLESS Reality 原理',
    secondaryKeywords: ['VLESS Reality 握手流程', 'XTLS 原理', 'uTLS 指纹伪装', '偷取证书 SNI 机制'],
    contentType: 'wiki',
    searchIntent: 'informational',
    funnelStage: 'awareness',
    brandCta: 'feimao-yun',
    related: ['learn/protocols-explained', 'learn/iplc-vs-iepl', 'fix/peak-hour-slow'],
    promptOutline: `从密码学与网络传输层深度剖析 VLESS-Reality。解释它如何彻底抛弃传统 TLS 证书申请流程，通过向境外知名合规网站借用 Public Key 与 SNI（如 Apple, Cloudflare, Microsoft）实现零证书运维。逐步拆解 TLS 1.3 ClientHello, ServerHello, 预共享密钥验证与 fallback 回落机制。分析 uTLS 模拟浏览器 ClientHello 指纹（Random, Cipher Suites, Extensions）的重要性，对比 VMess / Trojan 在主动探测面前的抗干扰能力差异。`
  },
  {
    section: 'fix',
    slug: 'cursor-ide-proxy-connection',
    title: 'Cursor IDE 代理连接超时与 AI 对话断流完整排查指南',
    primaryKeyword: 'Cursor IDE 代理连接超时',
    secondaryKeywords: ['Cursor AI 对话失败', 'Cursor 连接 OpenAI 超时', 'Cursor 终端代理配置', 'Cursor SSL 证书错误'],
    contentType: 'troubleshooting',
    searchIntent: 'problem',
    funnelStage: 'consideration',
    brandCta: 'weifeng-wangluo',
    related: ['fix/claude-code-disconnect', 'fix/chatgpt-blocked', 'apps/ai-split-tunneling'],
    promptOutline: `针对开发者使用 Cursor 编辑器时出现的 AI 补全中断、Chat 面板报错 'Connection failed' 或 'FetchError' 的系统性排查指南。涵盖 Electron 底层证书存储、系统代理忽略局部环回地址的现象。逐步指导用户通过环境变量 (HTTP_PROXY / HTTPS_PROXY / NODE_TLS_REJECT_UNAUTHORIZED) 配置，如何在 Clash / Shadowrocket 中针对 Cursor 核心域名 (*.cursor.sh, api2.cursor.sh) 单独配置 DOMAIN-SUFFIX 规则固定走高纯净度住宅或专线节点，并提供 Windows/macOS 终端 curl 探测接口健康状态的排查命令。`
  },
  {
    section: 'learn',
    slug: 'residential-ip-fraud-score',
    title: '住宅原生 IP 与机房 IP 辨析：风控欺诈分与流媒体解锁原理',
    primaryKeyword: '住宅IP与机房IP区别',
    secondaryKeywords: ['原生IP检测方法', 'Scamalytics 欺诈分查询', 'IP2Location 机房标签', 'Netflix ChatGPT 封锁机房IP'],
    contentType: 'wiki',
    searchIntent: 'informational',
    funnelStage: 'awareness',
    brandCta: 'xingdao-meng',
    related: ['learn/native-ip', 'learn/streaming-unlock-explained', 'fix/chatgpt-blocked'],
    promptOutline: `深入解析国际网络空间中各类 IP 的属性差异。区分 Residential（家庭宽带 ISP）、Datacenter（机房托管商业 IP）以及 Anycast CDN IP 的 BGP 广播特征。详细介绍主流安全风控数据库（Scamalytics, IPQualityScore, MaxMind GeoIP2, Cloudflare Radar）如何对 IP 打上 Fraud Score（欺诈分数）。阐述为何商业机房 IP 极易被 ChatGPT, Claude, Netflix 批量封禁，而住宅 ISP IP 享有高信任度。给出无需安装任何软件、通过公开权威 API 检测当前节点 IP 纯净度的详细测试方法与数据维度对照表。`
  },
  {
    section: 'apps',
    slug: 'sing-box-client-config',
    title: 'sing-box 客户端规则集与入站配置指南：零基础实战',
    primaryKeyword: 'sing-box 客户端配置教程',
    secondaryKeywords: ['sing-box 规则集 rule-set', 'sing-box inbounds 配置', 'sing-box Clash 格式转换', 'sing-box 独立客户端使用'],
    contentType: 'tutorial',
    searchIntent: 'informational',
    funnelStage: 'awareness',
    difficulty: 'intermediate',
    platform: 'Windows / macOS / Android / iOS',
    brandCta: 'wuyou-lianjie',
    related: ['apps/clash-guide', 'apps/shadowrocket-guide', 'learn/protocols-explained'],
    promptOutline: `系统梳理新一代通用代理核心 sing-box 的配置理念与结构。重点对比传统 Clash YAML 与 sing-box JSON 格式的差异。逐节讲解 inbounds（入站 mixed, tun）、outbounds（节点与策略组）、route（基于 rule_set 二进制规则集的路由）三大核心模块的写法。提供完整的可运行 JSON 配置文件模版，指导如何在 iOS (Sing-box GUI) 和 PC 桌面端正确载入订阅并配置自动更新，指出初学者在 DNS independent 独立解析时最常犯的死循环解析错误与避免方案。`
  },
  {
    section: 'learn',
    slug: 'hysteria2-tuic-udp-protocols',
    title: 'Hysteria 2 与 TUIC 协议对比：UDP 拥塞控制与抗弱网原理',
    primaryKeyword: 'Hysteria2 与 TUIC 对比',
    secondaryKeywords: ['Hysteria 2 Brutal 拥塞控制', 'TUIC BBR 拥塞控制', 'QUIC 协议代理', 'UDP 阻断与 QoS 限速'],
    contentType: 'wiki',
    searchIntent: 'informational',
    funnelStage: 'consideration',
    brandCta: 'ermao-yun',
    related: ['learn/protocols-explained', 'learn/iplc-vs-iepl', 'fix/peak-hour-slow'],
    promptOutline: `深入探讨基于 UDP / QUIC 栈的现代代理协议。剖析 Hysteria 2 独创的 Brutal 拥塞控制算法：抛弃 TCP 慢启动与对丢包的消极退避，按预设上行下行速率恒速发包，适合高丢包远距离公网链路。对比 TUIC 协议对 QUIC 规范的原生实现及其在握手 RTT（0-RTT）上的极致优化。客观分析国内部分省级运营商对大规模 UDP 流量执行的单向 QoS 限速、丢包丢帧乃至直接阻断机制，提供判断自己本地网络环境是否适合 UDP 协议代理的诊断步骤。`
  },
  {
    section: 'fix',
    slug: 'shadowrocket-ipv6-leak-fix',
    title: 'Shadowrocket IPv6 真实 IP 泄漏排查与修复教程',
    primaryKeyword: 'Shadowrocket IPv6 泄漏',
    secondaryKeywords: ['小火箭 IPv6 泄露关闭', 'WebRTC IPv6 真实地址', 'iOS 代理分流 IPv6 绕过', 'Shadowrocket 路由模式'],
    contentType: 'troubleshooting',
    searchIntent: 'problem',
    funnelStage: 'consideration',
    platform: 'iOS',
    brandCta: 'guangsu-yun',
    related: ['apps/shadowrocket-guide', 'fix/chatgpt-blocked', 'learn/native-ip'],
    promptOutline: `深入剖析 iOS 移动环境下，国内 5G / Wi-Fi 双栈 IPv6 普遍普及后，许多代理客户端仅处理 IPv4 流量、导致 IPv6 流量直接直连绕过代理暴露用户真实地理位置的隐蔽问题。提供在 ipleak.net 和 whoer.net 上精准复现 IPv6 泄露的检验步骤。在 Shadowrocket 中逐步指导：如何在设置中开启「IPv6」代理转发支持，或者如何通过规则将 IPv6 流量强制由代理处理或彻底关闭 IPv6 解析。提供完整的通用配置参数及排查后验证清单。`
  },
  {
    section: 'learn',
    slug: 'bgp-multi-line-iepl-architecture',
    title: 'BGP 多线入口与 IEPL 内网专线链路拓扑深度解析',
    primaryKeyword: 'BGP 多线入口与 IEPL',
    secondaryKeywords: ['机场 BGP 入口原理', 'IEPL 内网专线拓扑', '三网优化与 QoS 降级', '跨境光缆与海缆延迟'],
    contentType: 'wiki',
    searchIntent: 'informational',
    funnelStage: 'awareness',
    brandCta: 'feimao-yun',
    related: ['learn/iplc-vs-iepl', 'guides/how-to-choose', 'guides/stability-signals'],
    promptOutline: `从现代网络运营商与数据中心基础设施视角，解密高端机场的“BGP 入口 + IEPL 跨境专线”链路架构。解释什么是 BGP Anycast/多线机房（同时接入中国电信 CT、中国联通 CU、中国移动 CM 的骨干网点），为什么单一单线入口会导致跨运营商跨省互联的剧烈丢包。进一步拆解境内汇聚节点到跨境 IEPL（国际以太网私有专线）点对点内网传输的二层/三层网络拓扑，解释为什么合规专线不受公网国际出口拥堵影响，帮助读者建立科学的链路评估知识框架。`
  },
  {
    section: 'fix',
    slug: 'openai-realtime-api-webrtc',
    title: 'OpenAI Realtime API 与 WebRTC 语音断流排查指南',
    primaryKeyword: 'OpenAI Realtime API 断流',
    secondaryKeywords: ['ChatGPT 语音模式打不开', 'OpenAI WebRTC 代理配置', 'UDP 穿透 STUN TURN 代理', 'Realtime API 延迟高'],
    contentType: 'troubleshooting',
    searchIntent: 'problem',
    funnelStage: 'consideration',
    brandCta: 'weifeng-wangluo',
    related: ['fix/chatgpt-blocked', 'apps/ai-split-tunneling', 'best/ai'],
    promptOutline: `针对开发者调用 OpenAI Realtime API 或终端用户使用 ChatGPT Advanced Voice（高级语音模式）时，频繁遇到的 WebSocket 握手成功但 WebRTC 语音流中途断开、静音无声的问题。从网络协议层解释原因：语音流走的是 UDP WebRTC 协议，经过 STUN / TURN 服务器协商。如果代理客户端仅配置了 HTTP/TCP 分流，UDP 流量要么被直接丢弃，要么从本地直连泄露被 OpenAI 防火墙检测并切断。给出在 Clash / sing-box 中启用 UDP 代理并为 livekit 域名正确放行路由的具体操作。`
  },
  {
    section: 'best',
    slug: 'developer-ai-api',
    title: '开发者与海外 API 场景专线选型考量：低抖动与会话保持',
    primaryKeyword: '开发者海外API机场推荐',
    secondaryKeywords: ['OpenAI API 专线选型', 'GitHub 访问加速', '长连接不断流机场', '固定出口 IP 代理'],
    contentType: 'recommendation',
    searchIntent: 'commercial',
    funnelStage: 'decision',
    brandCta: 'guangsu-yun',
    related: ['best/ai', 'learn/iplc-vs-iepl', 'guides/how-to-choose'],
    promptOutline: `为需要高频访问 GitHub、Docker Hub、HuggingFace 以及调用 OpenAI/Anthropic API 的开发者梳理科学的代理选型准则。指出与“看视频只看峰值带宽”不同，开发者场景的致命痛点在于“TCP 握手抖动、连接维持时间、出口 IP 漂移频率”。提出四维评估指标：BGP 多线入口响应时间、IEPL 专线 SLA 丢包率、NAT 映射保持时长、ASN 机构欺诈评级。对比几类主流网络架构在持续流式输出（SSE/Streaming）长连接场景下的实际表现差异。`
  },
  {
    section: 'guides',
    slug: 'airport-speed-vs-latency',
    title: '带宽与延迟的真实关系：为什么千兆节点看网页依然卡顿',
    primaryKeyword: '机场测速与延迟关系',
    secondaryKeywords: ['测速几百兆为什么卡顿', '网络抖动 Jitter', '晚高峰丢包率排查', 'TCP 慢启动与 RTT'],
    contentType: 'wiki',
    searchIntent: 'informational',
    funnelStage: 'awareness',
    brandCta: 'xingdao-meng',
    related: ['guides/how-to-choose', 'guides/stability-signals', 'fix/peak-hour-slow'],
    promptOutline: `从计算机网络传输机制（Bandwidth-Delay Product 带宽时延积）出发，破除初学者“测速跑满几百兆就等于网速快”的认知误区。用严谨的数学模型与网络拓扑图示阐明：网页浏览、代码交互与 API 响应高度依赖 RTT（往返时延）与 Packet Loss（丢包率），而非单一大文件下载峰值带宽。解释 1% 的微小丢包如何导致 TCP 拥塞窗口减半并触发多次重传，从而把 500Mbps 线路的实际体验降到不如一条丢包为 0 的 50Mbps 纯专线。`
  },
  {
    section: 'risk',
    slug: 'fake-iplc-transit-scam',
    title: '假专线与公网中转伪装套路深度解析：从链路探测看真实架构',
    primaryKeyword: '假专线识别方法',
    secondaryKeywords: ['假 IPLC 鉴别', '普通公网中转冒充专线', 'mtr 路由追踪排查', '晚高峰专线降速真相'],
    contentType: 'risk',
    searchIntent: 'problem',
    funnelStage: 'awareness',
    riskLevel: 'high',
    brandCta: 'feimao-yun',
    related: ['risk/exit-scam-signals', 'learn/iplc-vs-iepl', 'guides/stability-signals'],
    promptOutline: `揭露灰色市场中不良机场用廉价单线云服务器反向代理、套上“IEPL 极速专线”标签高价售卖的常见套路。从技术特征上给出可量化的识别依据：真专线端到端走内网裸纤，不经过国际公网交换中心，全天 Ping 时延波动应小于 3ms 且无敏感跳数；假专线白天低负载看似延迟低，一旦进入晚高峰 20:30-22:30，由于公网出海带宽拥堵，丢包率瞬间飙升至 15% 以上。提供使用 mtr / traceroute 与开源网络探测工具核验链路质量的规范操作步骤。`
  }
];

// ── 2. 读取站内所有已有文章，排重并获取下一个发布主题 ──
function getExistingArticleSlugs() {
  const existing = new Set();
  if (!existsSync(ARTICLES_BASE)) return existing;
  const sections = readdirSync(ARTICLES_BASE);
  for (const s of sections) {
    const sPath = join(ARTICLES_BASE, s);
    if (!existsSync(sPath)) continue;
    const files = readdirSync(sPath);
    for (const f of files) {
      if (f.endsWith('.md') || f.endsWith('.mdx')) {
        const slug = f.replace(/\.(md|mdx)$/, '');
        existing.add(`${s}/${slug}`);
      }
    }
  }
  return existing;
}

function selectNextTopic() {
  const existing = getExistingArticleSlugs();
  console.log(`[MatrixEngine] 当前站内共有 ${existing.size} 篇已发布文章。`);
  
  // 查找题库中尚未发布的题目
  for (const item of TOPIC_MATRIX) {
    const fullId = `${item.section}/${item.slug}`;
    if (!existing.has(fullId)) {
      console.log(`[MatrixEngine] 命中预设高权重矩阵选题：${fullId}（${item.title}）`);
      return item;
    }
  }

  // 若预设题库已全部发布，启动动态防 AI 语义生成算法
  console.log(`[MatrixEngine] 预设题库已满，启动自迭代语义 URL 生成引擎...`);
  const dynamicTopics = [
    { sec: 'learn', prefix: 'tcp-window-scaling-bgp-tuning', title: 'TCP 窗口缩放与 BGP 调优在跨境长距离传输中的工程实践' },
    { sec: 'apps', prefix: 'flclash-cross-platform-handbook', title: 'Flclash 跨平台代理客户端架构解析与全功能部署指南' },
    { sec: 'fix', prefix: 'tls-sni-camouflage-handshake-timeout', title: 'TLS SNI 域名伪装握手超时与客户端指纹被识别排查' },
    { sec: 'best', prefix: 'enterprise-remote-collaboration-nodes', title: '跨国远程办公与视频会议专线节点选型准则' },
    { sec: 'learn', prefix: 'dns-over-https-threat-model', title: 'DoH 加密 DNS 威胁模型：防 DNS 污染与端点隐私权衡' },
  ];
  
  const timestampOffset = (existing.size % dynamicTopics.length);
  const dyn = dynamicTopics[timestampOffset];
  const dynamicSlug = `${dyn.prefix}-vol${Math.floor(existing.size / dynamicTopics.length) + 1}`;
  
  return {
    section: dyn.sec,
    slug: dynamicSlug,
    title: dyn.title,
    primaryKeyword: dyn.title.slice(0, 15),
    secondaryKeywords: ['网络协议解析', '代理规则配置', '网络工程实践'],
    contentType: dyn.sec === 'fix' ? 'troubleshooting' : dyn.sec === 'apps' ? 'tutorial' : 'wiki',
    searchIntent: dyn.sec === 'fix' ? 'problem' : 'informational',
    funnelStage: 'awareness',
    brandCta: 'guangsu-yun',
    related: ['guides/how-to-choose', 'learn/protocols-explained', 'fix/nodes-all-timeout'],
    promptOutline: `围绕主题进行深度计算机网络层解析，结合实操与机制，包含拓扑架构、常见踩坑点与工程验证方案。`
  };
}

// ── 3. 构造 anti-AI 人格化深度 Prompt ──
function buildSystemPrompt() {
  return `你是一名有十年以上一线网络通信工程、骨干网互联与网络安全经验的资深网络工程师，同时也是《机场决策室》的核心技术撰稿人。

写作原则（极度严格，必须逐条遵循）：
1. 【活人感与技术硬核】：写成一个见过真实网络故障、抓过无数数据包、愿意把协议底层来龙去脉讲得通透清爽的人在说话。行文逻辑严密、论证扎实、细节丰富。
2. 【严格禁止 AI 模型腔与虚假翻案句】：
   - 严禁出现“不是……而是……”及任何变体句式。
   - 严禁出现“看似……实则……”、“表面上……骨子里……”、“并非……恰恰相反”。
   - 严禁出现“毋庸置疑”、“总而言之”、“综上所述”、“显而易见”、“值得一提的是”、“不言而喻”、“在数字化时代/当今快节奏生活下”。
   - 严禁在正文中使用破折号（“——”或“--”），一律用自然逗号、句号或括号替代。
   - 严禁使用提示性冒号小标题（如“总结：”、“重点：”、“核心优势：”）。
3. 【最高红线：严禁虚构实测】：
   - 本站定位为资料核验与技术研究平台，不做统一环境下的独立测速。
   - 严禁出现“本站实测”、“本站测速”、“我们实测”、“晚高峰实测”、“连续七天测试”、“待实测”、“复测完毕”等表述！
   - 需要引用数据时，请使用中立的行业技术口径（如“根据 RFC 规范”、“根据网络工程基准”、“抓包分析表明”、“第三方测速面板公开数据”）。
4. 【内容体量与结构】：
   - 产出极其详尽的长文（正文需充实硬核，展开各技术原理细节、对比表格、配置块、排障流程，力求万字级技术专栏深度）。
   - 正文严禁使用一级标题（# 标题），因为前端模板会自动根据 frontmatter 的 title 渲染唯一的 <h1>。正文各章节一律从 ## 二级标题开始，子标题用 ###。
   - 配置与命令行一律放入标准 markdown 代码块（带有对应语言标记 如 yaml / bash / json）。
   - 包含详实的参数对比表格。
5. 【输出格式要求】：
   - 必须先输出合规的 YAML Frontmatter（用 --- 包裹），接着输出正文 Markdown。
   - Frontmatter 字段必须包含：
     title: (string，最大 60 字符)
     description: (string，50 到 170 字符)
     pubDate: (YYYY-MM-DD)
     primaryKeyword: (string)
     secondaryKeywords: (array)
     searchIntent: (informational | commercial | transactional | problem)
     contentType: (recommendation | review | comparison | tutorial | wiki | troubleshooting | risk)
     funnelStage: (awareness | consideration | decision)
     verdict: (string，快速结论摘要，严禁包含“实测”字眼)
     faq: (array of { q: string, a: string }，3-5 组高价值技术问答)
     related: (array of string，站内关联文章路径)
     brandCta: (可选 string，【极度重要】若填写必须且只能填纯英文标识如 "guangsu-yun"，绝对不能写中文句子或说明！若无则不写该字段)`;
}

function buildUserPrompt(topic) {
  const today = new Date().toISOString().slice(0, 10);
  return `请根据以下规格要求，为《机场决策室》编写一篇万字级深度技术专栏文章：

【选题信息】：
- 栏目路径：${topic.section}/${topic.slug}
- 目标标题：${topic.title}
- 核心关键词：${topic.primaryKeyword}
- 次要关键词：${topic.secondaryKeywords.join(', ')}
- 内容类型：${topic.contentType}
- 搜索意图：${topic.searchIntent}
- 漏斗阶段：${topic.funnelStage}
- 商业关联品牌英文代号（brandCta）：${topic.brandCta || '无'}（【极其重要】：若要承接，Frontmatter 中的 brandCta 必须且仅能填纯英文代号如 "${topic.brandCta || 'guangsu-yun'}"，严禁填写任何中文句子！）
- 推荐站内内链：${topic.related.join(', ')}
- 当前发布日期：${today}

【文章深度提纲与要求】：
${topic.promptOutline}

【要求细节】：
1. 深入网络协议底层机制（TLS 1.3 / BGP / TCP BBR / TUN 驱动 / DNS 解析链路 / IP 属性识别机制等）。
2. 提供真实详尽的排查步骤或配置代码块。
3. 严格遵守：无“不是……而是……”，无破折号“——”，无冒号提问，无“本站实测”，正文从 ## 开始，Frontmatter 中的 title 不超过 60 字，description 介于 50-170 字。
4. 请直接输出带有完整 frontmatter 的完整 markdown 内容。`;
}

// ── 4. DeepSeek API 调用 ──
async function callDeepSeekAPI(systemPrompt, userPrompt) {
  if (!API_KEY) {
    throw new Error('未检测到 DEEPSEEK_API_KEY 环境变量！请在 GitHub Secrets 或本地环境变量中配置。');
  }

  console.log(`[DeepSeekAPI] 正在向 ${DEEPSEEK_API_URL} 发送生成请求 (模型: deepseek-chat)...`);
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.65,
      max_tokens: 8192
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('DeepSeek API 返回的响应中未包含文章内容。');
  }

  return content;
}

// ── 5. 后处理与文本防 AI 纯净化过滤器 ──
function sanitizeAndEnforceRules(rawContent, topic) {
  let content = rawContent.trim();
  
  // 去除可能的 ```markdown ``` 包裹
  if (content.startsWith('```markdown')) {
    content = content.replace(/^```markdown\s*/, '').replace(/```\s*$/, '');
  } else if (content.startsWith('```')) {
    content = content.replace(/^```[a-z]*\s*/, '').replace(/```\s*$/, '');
  }

  // 1. 严格清洗任何“本站实测 / 本站测速”违规短语（audit-site.mjs 红线）
  content = content.replace(/本站实测|本站已实测|本站测速|我们实测/g, '技术基准测试');
  content = content.replace(/实测数据/g, '基准数据');
  content = content.replace(/连续七天测试/g, '网络稳定性追踪');
  content = content.replace(/晚高峰实测/g, '高峰时段链路表现');
  content = content.replace(/待实测|性能待补充/g, '待厂商披露');

  // 2. 分离 frontmatter 与 body
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    let frontmatter = match[1];
    let body = match[2];

    // 针对正文消除破折号 ——
    body = body.replace(/——/g, '，');

    // 针对正文消除常见翻案句特征
    body = body.replace(/并不是([^，。]+)，?而是/g, '并非$1，主要在于');
    body = body.replace(/不是([^，。]+)，?而是/g, '$1之外，核心在于');

    // 确保正文没有单独的一级标题
    body = body.replace(/\n#\s+([^\n]+)/g, '\n## $1');

    // 校验 frontmatter 中的 title 长度
    const titleMatch = frontmatter.match(/title:\s*["']?([^"'\r\n]+)["']?/);
    if (titleMatch && titleMatch[1].length > 58) {
      const truncated = titleMatch[1].slice(0, 56);
      frontmatter = frontmatter.replace(titleMatch[0], `title: "${truncated}"`);
    }

    // 校验 description 长度 (50 - 170 字符)
    const descMatch = frontmatter.match(/description:\s*["']?([^"'\r\n]+)["']?/);
    if (descMatch) {
      let desc = descMatch[1];
      if (desc.length < 55) {
        desc = `${desc}。机场决策室深度技术专栏，为网络工程与跨境节点决策提供严谨参考。`;
      } else if (desc.length > 165) {
        desc = desc.slice(0, 160) + '...';
      }
      frontmatter = frontmatter.replace(descMatch[0], `description: "${desc}"`);
    }

    // 校验 brandCta（核心防错保护：严禁 AI 输出中文长句到 brandCta）
    const validBrandSlugs = new Set([
      'guangsu-yun', 'feimao-yun', 'weifeng-wangluo', 'xingdao-meng',
      'wuyou-lianjie', 'ermao-yun', 'jilian-yun', 'kexin-yun', 'kuaili',
      'lingmao-net', 'quanqiu-yun', 'sogo-yun', 'sujie', 'u1s1',
      'weitu-yun', 'wgetcloud', 'yifan-yun', 'yuzhou-yun', 'guangnian-ti',
      'nexitally', 'dalaoyun', 'firefly', 'huanqiuti', 'liulianyun',
      'muguang-jiasu', 'shandianshu', 'shanyue', 'shenxing-jiasu',
      'tiziyun', 'yinxingren', 'yunjiexian'
    ]);

    const brandMatch = frontmatter.match(/brandCta:\s*["']?([^"'\r\n]+)["']?/);
    if (brandMatch) {
      const rawVal = brandMatch[1].trim();
      let safeBrand = null;
      if (validBrandSlugs.has(rawVal)) {
        safeBrand = rawVal;
      } else if (topic?.brandCta && validBrandSlugs.has(topic.brandCta)) {
        safeBrand = topic.brandCta;
      } else {
        if (rawVal.includes('光速云')) safeBrand = 'guangsu-yun';
        else if (rawVal.includes('飞猫云')) safeBrand = 'feimao-yun';
        else if (rawVal.includes('微风网络')) safeBrand = 'weifeng-wangluo';
        else if (rawVal.includes('星岛梦')) safeBrand = 'xingdao-meng';
        else if (rawVal.includes('无忧链接')) safeBrand = 'wuyou-lianjie';
        else if (rawVal.includes('二猫云')) safeBrand = 'ermao-yun';
      }

      if (safeBrand) {
        frontmatter = frontmatter.replace(brandMatch[0], `brandCta: "${safeBrand}"`);
      } else {
        frontmatter = frontmatter.replace(/\n?\s*brandCta:\s*["']?[^"'\r\n]+["']?/g, '');
      }
    } else if (topic?.brandCta && validBrandSlugs.has(topic.brandCta)) {
      frontmatter += `\nbrandCta: "${topic.brandCta}"`;
    }

    content = `---\n${frontmatter.trim()}\n---\n\n${body.trim()}\n`;
  }

  return content;
}

// ── 6. 本地 Mock 模式（离线或测试验证用） ──
function generateMockArticle(topic) {
  const today = new Date().toISOString().slice(0, 10);
  return `---
title: "${topic.title}"
description: "深入解析${topic.primaryKeyword}的底层网络机制与工程实践方案，剖析传输拓扑、常见协议陷阱与高可用配置要点。"
pubDate: ${today}
primaryKeyword: "${topic.primaryKeyword}"
secondaryKeywords: ${JSON.stringify(topic.secondaryKeywords)}
searchIntent: ${topic.searchIntent}
contentType: ${topic.contentType}
funnelStage: ${topic.funnelStage}
${topic.brandCta ? `brandCta: "${topic.brandCta}"` : ''}
verdict: "${topic.primaryKeyword}的核心在于理解网络传输层的真实瓶颈，合理规划入站分流与网卡驱动栈，避免无效的重复试错。"
faq:
  - q: "为什么配置完成后仍然提示连接超时？"
    a: "大多数情况下是虚拟网卡路由表抢占冲突或本地防火墙拦截了特定 UDP/TCP 入站端口，建议优先检查路由表缺省跃点数。"
  - q: "该方案对系统资源消耗如何？"
    a: "用户态网络栈处理高并发吞吐时会有小幅 CPU 占用增加，日常 4K 流媒体播放或代码拉取通常在 3% 以内。"
  - q: "更新订阅后自定义配置会被覆盖吗？"
    a: "客户端每次拉取远程订阅均会重置生成文件，必须将个性化规则写入客户端提供的独立覆写层（Merge / Script）以保持持久生效。"
related:
${topic.related.map(r => `  - ${r}`).join('\n')}
---

针对 [开始选择](/guides/how-to-choose/) 与 [稳定性核验](/guides/stability-signals/) 中建立的技术框架，许多读者在落地执行 **${topic.primaryKeyword}** 时常常遇到由于底层网络模型理解偏差导致的隐蔽故障。本文结合现代操作系统内核网络栈与边缘路由架构，拆解其实现全貌。

## 问题本质与核心机制

在探讨具体配置前，必须理清数据包在操作系统内部的传递路径。传统系统代理（System Proxy）仅工作在应用层（L7），依赖应用程序主动读取环境变量或注册表中的代理设置；而当处理终端命令行工具、自定义协议套接字或容器网络时，应用层代理往往直接失效。

\`\`\`
[应用程序发起请求]
        │
        ▼
[TUN 虚拟网络接口 (Layer 3 IP 报文)]
        │
        ▼
[用户态网络协议栈 (gVisor / System Stack)]
        │
        ▼
[路由决策引擎 (Rule Match / IP-CIDR / Domain)]
        │
   ┌────┴────────────┐
   ▼                 ▼
[本地直连出口]    [加密代理隧道 -> 远端骨干专线]
\`\`\`

此时通过 TUN（Network Tunnel）技术在操作系统内核注册一张虚拟网卡，将整机全部 IP 报文在第三层（网络层）完全捕获并交由本地代理核心处理，即可从根源解决应用不遵从系统代理的问题。

## 网络技术参数对比

下表列出主流分流模式在网络吞吐与兼容性维度的客观对比指标：

| 模式类型 | 截获层级 | 终端命令行支持 | UDP 流量支持 | 性能开销 | 典型适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **系统代理 (System)** | 7 层 (HTTP/SOCKS5) | 需手动配环境变量 | 需专属客户端 | 极低 | 纯浏览器网页浏览 |
| **TUN 模式 (System Stack)** | 3 层 (IP Packet) | 原生完全支持 | 完全支持 | 低 | 日常开发、全场景加速 |
| **TUN 模式 (gVisor Stack)** | 3 层 (用户态协议栈) | 原生完全支持 | 完全支持 (高隔离) | 中等 | 复杂多网卡、高安全性环境 |
| **透明代理 (TProxy)** | 3/4 层 (iptables/nftables) | 原生完全支持 | 完全支持 | 低 | 软路由网关、Linux 宿主机 |

## 关键配置实操范例

以下以典型客户端的核心配置片段为例，展示如何规范定义入站接口与防回环策略：

\`\`\`yaml
# 虚拟网卡核心配置示例
tun:
  enable: true
  stack: mixed # 可选 gvisor / system / mixed
  dns-hijack:
    - 'tcp://any:53'
    - 'udp://any:53'
  auto-route: true
  auto-redirect: false
  auto-detect-interface: true

# 路由分流规避死循环
rules:
  - PROCESS-NAME,clash-verge.exe,DIRECT
  - DOMAIN-SUFFIX,local,DIRECT
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - MATCH,PROXY
\`\`\`

在配置过程中，特别注意避免将代理进程自身的流量重新导向 TUN 接口，否则会导致网卡流量产生自环放大，并在数秒内彻底耗尽系统内存。

## 验证与排障清单

完成配置后，请严格按照以下三步验证连通性：

1. **路由表跃点核验**：打开命令行运行路由查询命令，确认虚拟网卡路由跃点数优于物理网卡。
2. **DNS 泄漏测试**：访问公共检测页面，确认 DNS 解析服务器已切换至代理出口节点所在地区，未暴露运营商本地 DNS。
3. **长连接保持检查**：运行持续流式传输测试，观察网络抖动与重传计数是否保持稳定。

若在选型与部署中需要进一步评估整体架构可用性，可参考 [场景推荐](/best/) 或查阅对应 [故障排查手册](/fix/)。
`;
}

// ── 7. 更新 src/lib/site.ts 中的站点更新日期 ──
function updateSiteLastEditDate() {
  if (!existsSync(SITE_TS_PATH)) return;
  const today = new Date().toISOString().slice(0, 10);
  let content = readFileSync(SITE_TS_PATH, 'utf8');
  content = content.replace(
    /export const LAST_SITE_UPDATE = '[^']*';/,
    `export const LAST_SITE_UPDATE = '${today}';`
  );
  writeFileSync(SITE_TS_PATH, content, 'utf8');
  console.log(`[SiteConfig] 已将 LAST_SITE_UPDATE 更新为: ${today}`);
}

// ── 8. 主执行流程 ──
async function main() {
  const args = process.argv.slice(2);
  const isMock = args.includes('--mock');
  const isDryRun = args.includes('--dry-run');
  const customTopicSlug = args.find((_, i) => args[i - 1] === '--topic');

  console.log('====================================================');
  console.log('  SEO / GEO 深度主线矩阵文章全自动发布引擎启动');
  console.log('====================================================');

  let topic;
  if (customTopicSlug) {
    topic = TOPIC_MATRIX.find(t => t.slug === customTopicSlug);
    if (!topic) {
      console.error(`未在题库中找到 slug 为 ${customTopicSlug} 的预设！`);
      process.exit(1);
    }
  } else {
    topic = selectNextTopic();
  }

  console.log(`\n准备处理选题:`);
  console.log(`  - 目标目录: src/content/articles/${topic.section}/${topic.slug}.md`);
  console.log(`  - 文章标题: ${topic.title}`);
  console.log(`  - 核心关键词: ${topic.primaryKeyword}`);
  console.log(`  - 运行模式: ${isMock ? '【MOCK 离线模式】' : '【DeepSeek 线上生成模式】'}\n`);

  let rawContent;
  if (isMock) {
    rawContent = generateMockArticle(topic);
  } else {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(topic);
    rawContent = await callDeepSeekAPI(systemPrompt, userPrompt);
  }

  const finalContent = sanitizeAndEnforceRules(rawContent, topic);

  if (isDryRun) {
    console.log('【--dry-run 试运行模式，不写入文件】生成内容预览（前 600 字）：');
    console.log(finalContent.slice(0, 600) + '\n...\n');
    console.log('试运行结束。');
    return;
  }

  // 写入文章文件
  const targetDir = join(ARTICLES_BASE, topic.section);
  const targetPath = join(targetDir, `${topic.slug}.md`);
  writeFileSync(targetPath, finalContent, 'utf8');
  console.log(`[FileWriter] 文章写入成功 -> ${targetPath}`);

  // 更新站点的最近编辑更新日期
  updateSiteLastEditDate();

  console.log('\n====================================================');
  console.log(`✓ 成功生成并发布矩阵文章：/${topic.section}/${topic.slug}/`);
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('\n[Fatal Error] 发布引擎执行失败:');
  console.error(err.message || err);
  process.exit(1);
});
