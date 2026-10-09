---
title: Cursor IDE 代理连接超时与 AI 对话断流完整排查指南
description: "从 Electron 证书存储、系统代理环回绕过、TLS 1.3 握手到 Clash 域名分流规则，系统排查 Cursor 编辑器 AI 补全中断、Chat 面板 FetchError 与连接超时问题。"
pubDate: 2026-10-09
primaryKeyword: Cursor IDE 代理连接超时
secondaryKeywords:
  - Cursor AI 对话失败
  - Cursor 连接 OpenAI 超时
  - Cursor 终端代理配置
  - Cursor SSL 证书错误
searchIntent: problem
contentType: troubleshooting
funnelStage: consideration
verdict: Cursor 的 AI 请求走 Electron 主进程而非系统浏览器栈，代理配置需同时覆盖环境变量、Chromium 网络栈与域名分流规则三层；多数超时源于环回地址绕过、证书链校验失败或节点 IP 被风控，按本文分层排查可定位到具体环节。
faq:
  - q: Cursor 已经设置了系统代理，为什么 Chat 面板仍然报 Connection failed？
    a: Cursor 基于 Electron，网络请求默认走 Chromium 网络栈，它会读取系统代理设置，但对 localhost、127.0.0.1 等环回地址默认绕过。若你的代理软件只监听环回端口且未开启 TUN 模式，Electron 可能既没走代理也没直连成功。需要通过 HTTP_PROXY / HTTPS_PROXY 环境变量显式指定，或让代理工具接管 TUN 层流量。
  - q: 设置 NODE_TLS_REJECT_UNAUTHORIZED=0 能解决 Cursor SSL 证书错误吗？
    a: 该变量会让 Node.js 进程跳过证书链校验，能临时绕过自签名证书或中间人代理导致的 UNABLE_TO_VERIFY_LEAF_SIGNATURE 报错，但会同时关闭所有 HTTPS 校验，存在中间人风险。正确做法是把代理工具的根证书导入系统信任库，并让 Electron 使用系统证书存储。
  - q: 为什么 Cursor 补全正常但 Chat 对话总是断流？
    a: 补全请求体量小、超时容忍度高，Chat 走的是流式 SSE 长连接，对链路稳定性、MTU 与节点出口纯净度更敏感。若节点存在 TCP 重传、TLS 会话被重置或出口 IP 被 OpenAI 风控，补全可能偶尔成功而 Chat 频繁中断。需要针对 api2.cursor.sh 单独指定稳定节点并检查 MTU。
  - q: Clash 里如何为 Cursor 单独配置分流规则？
    a: 使用 DOMAIN-SUFFIX,cursor.sh 与 DOMAIN-SUFFIX,cursor.com 规则，把 Cursor 相关域名固定指向高纯净度住宅或专线策略组，避免与普通流量共用被污染的出口 IP。规则顺序需放在 GEOIP 与 MATCH 兜底之前。
  - q: 如何在终端确认 Cursor 后端接口是否可达？
    a: 用 curl 带上 -v 与 --http1.1 参数探测 api2.cursor.sh 的 TLS 握手与响应头，观察证书链、TLS 版本协商与首字节时间。若握手成功但响应 403 或 429，问题在出口 IP 属性而非链路本身。
related:
  - fix/claude-code-disconnect
  - fix/chatgpt-blocked
  - apps/ai-split-tunneling
brandCta: "weifeng-wangluo"
---

Cursor 这类 AI 编辑器在开发者群体里普及之后，围绕它的网络问题几乎成了独立的一类故障。补全突然不弹、Chat 面板转圈然后甩出一句 Connection failed、终端里 git 操作正常但 AI 功能全挂，这些现象背后牵扯的层次比想象中多。它同时依赖 Electron 的 Chromium 网络栈、Node.js 运行时、系统证书存储、操作系统的代理设置，以及你本地那套代理软件的流量接管方式。任何一层错位，表现出来都是同一个模糊的报错。

这篇文章按故障定位的真实顺序展开，从最表层的报错文案，一路拆到 TLS 握手、DNS 解析链路和出口 IP 属性识别。目标是把每一个可能断掉的环节都讲清楚，让你在遇到问题时能自己判断卡在哪一层，而不是反复重启软件碰运气。

## 一、先搞清楚 Cursor 的网络请求到底走哪条路

很多人排查方向一开始就偏了，原因是把 Cursor 当成一个普通浏览器或普通命令行工具。它两者都不是。

Cursor 是 Electron 应用，主进程跑 Node.js，渲染进程跑 Chromium。它的 AI 请求分两类，走的是不同的代码路径。

补全（Tab completion）和部分索引请求由主进程的 Node.js 侧发起，走的是 Node 的 http/https 模块，遵循 Node 的代理环境变量约定。Chat 面板、Agent 模式的对话流则更接近 Chromium 网络栈，走 Electron 的 net 模块，它会读取系统代理设置，同时受 Chromium 自身的代理规则约束。

这个区别决定了一件关键的事。系统代理设置对两条路径的影响程度不一样。Chromium 网络栈会读系统代理，但它内置了一张代理绕过列表，默认包含 localhost、127.0.0.1、::1 以及部分本地网段。Node.js 侧则更依赖 HTTP_PROXY / HTTPS_PROXY 这类环境变量，对系统代理的读取并不完整。

于是出现一个典型现象：你的代理软件监听在 127.0.0.1:7890，系统代理也指向它，浏览器一切正常，但 Cursor 的 Chat 就是连不上。原因是 Chromium 认为 127.0.0.1 是环回地址，按默认规则绕过代理，请求直接发往目标，结果在本地网络出口被拦。

```bash
## 查看当前 Electron / Chromium 生效的代理相关环境变量
env | grep -iE "proxy|no_proxy"

## 典型输出可能是空的，说明环境变量层没有配置
## 此时 Chromium 只能依赖系统代理设置，而系统代理对环回的处理有默认绕过
```

理解这一层之后，很多"明明代理开着却连不上"的困惑就有了解释。接下来的排查都要围绕"请求实际走了哪条路径"来验证。

## 二、报错文案的语义拆解

Cursor 的报错信息不多，但每条指向的层次不同。先把它们分类。

| 报错文案 | 出现位置 | 大概率故障层 |
| --- | --- | --- |
| Connection failed | Chat 面板、Agent | 代理未生效或链路不通 |
| FetchError: request to ... failed | Chat、索引 | DNS 解析失败或 TCP 连接被拒 |
| net::ERR_CONNECTION_TIMED_OUT | 渲染进程控制台 | 出口被墙或节点不可达 |
| UNABLE_TO_VERIFY_LEAF_SIGNATURE | 主进程日志 | 证书链校验失败 |
| self signed certificate in certificate chain | 主进程日志 | 中间人代理证书未信任 |
| 429 Too Many Requests | 接口响应 | 出口 IP 被风控 |
| socket hang up | 长连接场景 | 链路抖动或 TLS 会话被重置 |

这张表的价值在于缩小范围。看到证书类报错就直接去查证书信任链，看到超时类就去查链路可达性，看到 429 就去查出口 IP 属性。不要在证书问题上折腾代理规则，也不要在链路问题上反复导入根证书。

## 三、Electron 证书存储与 SSL 校验的坑

证书问题是 Cursor 排查里最容易被误诊的一类。现象是补全和 Chat 全部失败，日志里出现证书校验错误，但浏览器访问同样的服务完全正常。

根源在于 Electron 的证书信任模型。Chromium 在 Linux 上使用 NSS 证书数据库，在 Windows 上使用系统证书存储，在 macOS 上使用 Keychain。而 Node.js 主进程默认使用它自己编译时内置的 CA bundle，这个 bundle 来自 Mozilla 的 CA 列表，和你系统里导入的证书是两套东西。

如果你用的是带中间人解密功能的代理工具，它会在本地生成一张根证书，用它签发的证书替换真实证书。浏览器之所以不报错，是因为这张根证书被导入到了系统信任库。但 Node.js 侧不认系统信任库，它只认自己的 CA bundle，于是校验失败。

```bash
## 查看 Node.js 当前使用的 CA 证书来源
node -e "console.log(process.env.NODE_EXTRA_CA_CERTS || 'using built-in bundle')"

## 让 Node.js 额外信任一张自定义根证书
export NODE_EXTRA_CA_CERTS=/path/to/your/proxy-ca.crt
```

NODE_EXTRA_CA_CERTS 是正解。它把额外的根证书追加到 Node 的内置 bundle 上，既解决了校验问题，又不关闭校验。相比之下，网上流传的 NODE_TLS_REJECT_UNAUTHORIZED=0 是另一回事。

```bash
## 危险做法，仅用于临时定位问题，不要长期保留
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

这个变量会让 Node.js 完全跳过证书链校验，任何证书都接受。它能快速验证"问题是不是出在证书上"，但代价是彻底失去中间人防护。用它定位可以，用它长期运行不行。

对于 Electron 渲染进程侧的证书问题，处理方式又不同。Chromium 有自己的证书错误处理逻辑，某些情况下需要在启动参数里指定忽略特定证书错误，但这同样属于临时手段。

```bash
## 仅在确认是证书问题且无法导入根证书时临时使用
## 通过 Electron 启动参数忽略证书错误（不推荐长期使用）
cursor --ignore-certificate-errors
```

macOS 上还有一个细节。Keychain 里的证书如果被标记为"始终信任"，Chromium 会接受，但如果只是"使用系统默认"，某些版本的 Electron 可能仍然报错。需要手动把代理工具的根证书拖进"系统"钥匙串，并设置为始终信任。

## 四、代理环境变量的正确配置姿势

环境变量是 Cursor 排查里最可控的一层。配置对了，能绕开系统代理设置的很多不确定性。

Node.js 生态里，代理相关的环境变量有几个，优先级和适用范围不同。

```bash
## 标准配置，大小写都写一份，兼容不同库的读取习惯
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"
export http_proxy="http://127.0.0.1:7890"
export https_proxy="http://127.0.0.1:7890"

## 明确指定哪些地址不走代理，注意把 Cursor 后端域名排除在外
export NO_PROXY="localhost,127.0.0.1,::1,0.0.0.0"
export no_proxy="localhost,127.0.0.1,::1,0.0.0.0"
```

这里有个常见错误。有人为了让本地服务不被代理，把 NO_PROXY 写成 `*` 或者包含了大范围网段，结果把 Cursor 的请求也一起绕过了。NO_PROXY 只应该包含真正的本地地址，不要图省事写通配。

Windows 上的配置方式不同，环境变量通过系统设置或 setx 命令设置。

```powershell
## PowerShell 中设置当前会话的代理变量
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY = "localhost,127.0.0.1,::1"

## 永久设置（需要重启终端和 Cursor 生效）
setx HTTP_PROXY "http://127.0.0.1:7890"
setx HTTPS_PROXY "http://127.0.0.1:7890"
```

设置完之后必须完全退出 Cursor 再重新启动，因为环境变量在进程启动时读取，运行中修改不生效。这一点很多人忽略，改完变量发现没效果就以为方法不对。

验证环境变量是否被 Cursor 进程继承，可以在启动后检查进程环境。

```bash
## Linux / macOS 查看 Cursor 进程的环境变量
ps aux | grep -i cursor | head -5
## 找到主进程 PID 后
cat /proc/<PID>/environ | tr '\0' '\n' | grep -i proxy
```

如果这里看不到你设置的变量，说明 Cursor 是从图形界面启动的，没有继承 shell 的环境变量。解决办法是从终端启动 Cursor，或者把变量写到系统级配置里。

```bash
## macOS 从终端启动 Cursor，继承当前 shell 环境
open -a Cursor

## 或者直接调用可执行文件
/Applications/Cursor.app/Contents/MacOS/Cursor
```

## 五、TLS 1.3 握手与 SNI 层面的问题

链路能通但握手失败，是另一类故障。表现是 TCP 连接建立成功，但 TLS 协商阶段卡住或直接被重置。

Cursor 后端接口普遍使用 TLS 1.3。TLS 1.3 的握手流程相比 1.2 有变化，特别是它默认启用加密的 SNI（ESNI 是另一回事，这里说的是 ClientHello 里的 SNI 扩展），并且移除了很多旧的密码套件。某些老旧的代理工具或中间设备对 TLS 1.3 支持不完整，会在握手阶段出问题。

```bash
## 强制使用 TLS 1.3 探测握手
curl -v --tlsv1.3 https://api2.cursor.sh/ 2>&1 | head -40

## 观察输出中的关键信息
## * TLSv1.3 (OUT), TLS handshake, Client hello (1)
## * TLSv1.3 (IN), TLS handshake, Server hello (2)
## * SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256
```

如果看到 Client hello 发出后长时间没有 Server hello 响应，说明握手请求在中间被拦或丢弃。这种情况常见于出口节点对特定 SNI 做了阻断。

SNI 阻断是链路层的一种干预方式。中间设备读取 ClientHello 里的 SNI 字段，如果匹配到特定域名就直接重置连接。绕过方式有几种，一是使用支持 ECH（Encrypted Client Hello）的客户端，二是让代理在隧道内完成 TLS 握手，三是更换出口节点。

```bash
## 检查 SNI 是否被阻断，对比不同域名的握手结果
curl -v --connect-timeout 5 https://api2.cursor.sh/ 2>&1 | grep -E "Connected|SSL|error"
curl -v --connect-timeout 5 https://www.example.com/ 2>&1 | grep -E "Connected|SSL|error"
```

如果 example.com 握手正常而 cursor 的接口握手失败，基本可以确定是 SNI 层面的干预。这时候需要在代理工具里针对该域名配置专门的出口。

## 六、DNS 解析链路与污染问题

DNS 是很多超时问题的隐藏根源。Cursor 的域名解析如果被污染，会解析到一个不可达的 IP，TCP 连接自然建立不起来。

```bash
## 查看 Cursor 相关域名的解析结果
nslookup api2.cursor.sh
dig api2.cursor.sh +short

## 对比不同 DNS 服务器的解析结果
dig @8.8.8.8 api2.cursor.sh +short
dig @1.1.1.1 api2.cursor.sh +short
dig @223.5.5.5 api2.cursor.sh +short
```

如果不同 DNS 返回的 IP 差异很大，或者返回的 IP 明显不属于主流 CDN 网段，就要怀疑解析被污染。Cursor 的后端通常部署在 Cloudflare 或 AWS 的 CDN 上，解析结果应该落在这些服务商的网段内。

更彻底的做法是让代理工具接管 DNS 解析。Clash 的 fake-ip 模式就是一个方案，它在本地维护一张域名到虚拟 IP 的映射表，应用拿到的虚拟 IP 在出站时被还原成域名，真正的解析在代理服务器侧完成，本地 DNS 污染就影响不到了。

```yaml
## Clash 配置片段，启用 fake-ip 模式
dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query
  fallback:
    - tls://1.1.1.1:853
    - tls://8.8.8.8:853
```

fake-ip 模式的一个副作用是某些依赖真实 DNS 结果的工具会出问题，比如需要做 IP 白名单校验的场景。对 Cursor 来说，fake-ip 通常是安全的，因为它的接口调用基于域名而非 IP 校验。

## 七、Clash / Shadowrocket 的域名分流规则

把 Cursor 的流量单独拎出来走特定节点，是解决出口 IP 问题的关键手段。Cursor 的接口对出口 IP 的属性比较敏感，普通机房 IP 容易被风控，表现为 429 或连接被重置。

先梳理 Cursor 的核心域名。

| 域名 | 用途 | 敏感度 |
| --- | --- | --- |
| api2.cursor.sh | AI 补全与 Chat 主接口 | 高 |
| api3.cursor.sh | 部分新接口 | 高 |
| cursor.sh | 主站与更新 | 中 |
| cursor.com | 官网与账号 | 低 |
| marketplace.cursor.sh | 插件市场 | 低 |

Clash 的规则配置，把高敏感域名指向专线或住宅节点策略组。

```yaml
rules:
  # Cursor 核心接口，指向高纯净度节点组
  - DOMAIN-SUFFIX,api2.cursor.sh,AI-Residential
  - DOMAIN-SUFFIX,api3.cursor.sh,AI-Residential
  - DOMAIN-SUFFIX,cursor.sh,AI-Residential
  # 官网与静态资源可以走普通节点
  - DOMAIN-SUFFIX,cursor.com,Proxy
  # 兜底规则放在最后
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
```

策略组定义，把住宅或专线节点单独归组。

```yaml
proxy-groups:
  - name: AI-Residential
    type: select
    proxies:
      - 住宅节点-01
      - 专线节点-01
      - 住宅节点-02
  - name: Proxy
    type: select
    proxies:
      - 普通节点-01
      - 普通节点-02
      - AI-Residential
```

规则顺序很重要。Clash 从上往下匹配，第一条命中的规则生效。DOMAIN-SUFFIX 规则必须放在 GEOIP 和 MATCH 之前，否则会被兜底规则抢先匹配。

Shadowrocket 的配置逻辑类似，但语法不同。

```ini
[Rule]
DOMAIN-SUFFIX,api2.cursor.sh,AI-Residential
DOMAIN-SUFFIX,api3.cursor.sh,AI-Residential
DOMAIN-SUFFIX,cursor.sh,AI-Residential
DOMAIN-SUFFIX,cursor.com,PROXY
GEOIP,CN,DIRECT
FINAL,PROXY
```

配置完成后需要验证规则是否生效。Clash 的日志会显示每条连接命中的规则。

```bash
## 查看 Clash 实时日志，过滤 Cursor 相关连接
tail -f ~/.config/clash/logs/access.log | grep cursor
```

日志里应该能看到 api2.cursor.sh 的连接被 AI-Residential 策略组处理，实际出口节点是住宅或专线节点。如果看到命中的是 MATCH 兜底规则，说明前面的域名规则没写对或者顺序有问题。

## 八、TUN 模式与系统代理的取舍

代理工具接管流量的方式有两种，系统代理和 TUN 模式。这两种方式对 Cursor 的影响不同。

系统代理模式下，应用需要主动读取代理设置并发起代理连接。Electron 的 Chromium 网络栈会读系统代理，但 Node.js 主进程不一定读，这就造成了前面说的两条路径不一致的问题。

TUN 模式在操作系统层面创建一个虚拟网卡，把所有流量在 IP 层接管，应用完全感知不到代理的存在。这种方式对 Cursor 最友好，因为无论请求走 Chromium 还是 Node.js，都会经过 TUN 网卡被接管。

```yaml
## Clash TUN 模式配置
tun:
  enable: true
  stack: system
  dns-hijack:
    - any:53
  auto-route: true
  auto-detect-interface: true
```

TUN 模式下的关键参数是 dns-hijack。它把发往任意地址的 53 端口 DNS 查询劫持到 Clash 内部的 DNS 解析器，配合 fake-ip 模式，能彻底避免本地 DNS 污染。

TUN 模式的代价是需要更高的权限，Windows 上需要管理员运行，macOS 上需要授权安装网络扩展。另外某些 VPN 软件和 TUN 模式会冲突，需要二选一。

对于 Cursor 这类对网络路径一致性要求高的应用，TUN 模式通常是更省心的选择。如果只能用系统代理模式，那就必须把环境变量配好，确保 Node.js 和 Chromium 两条路径都被覆盖。

## 九、TCP 层与 BBR 拥塞控制的影响

链路质量对 Cursor 的流式对话影响很大。Chat 走的是 SSE 长连接，数据持续推送，对丢包和延迟敏感。

TCP 的拥塞控制算法在这里起作用。默认的 CUBIC 在高丢包链路上会大幅降速，而 BBR 基于带宽和延迟估计，在有一定丢包的国际链路上表现更好。

```bash
## Linux 查看当前拥塞控制算法
sysctl net.ipv4.tcp_congestion_control

## 查看可用的算法
sysctl net.ipv4.tcp_available_congestion_control

## 临时切换到 BBR
sudo sysctl -w net.ipv4.tcp_congestion_control=bbr
```

这个设置影响的是本地到代理服务器这一段。代理服务器到 Cursor 后端那一段由服务商控制，用户改不了。所以 BBR 的收益主要体现在本地网络质量较差、到代理入口有丢包的情况。

MTU 是另一个容易被忽略的点。TUN 模式会引入额外的封装开销，如果 MTU 设置不当，大包会被分片或丢弃，表现为 TLS 握手成功但数据传输阶段卡住。

```bash
## 探测到代理入口的路径 MTU
ping -M do -s 1472 api2.cursor.sh

## 如果报 "Message too long"，逐步减小 -s 的值
ping -M do -s 1400 api2.cursor.sh
```

TUN 模式下通常需要把 MTU 调低到 1400 到 1420 之间，给封装留出空间。Clash 的 TUN 配置里可以指定 MTU。

```yaml
tun:
  enable: true
  mtu: 1400
  stack: system
```

## 十、出口 IP 属性与风控识别

这是最隐蔽的一层，也是最难自己排查的一层。Cursor 的后端会对请求来源的 IP 做属性判断，机房 IP、被滥用的 IP 段、数据中心 IP 都可能触发风控。

风控的表现形式多样。轻则响应变慢，重则直接返回 429 或 403，或者连接在 TLS 握手后被重置。

IP 属性识别通常基于几个维度。ASN 归属，住宅宽带和机房的 ASN 明显不同。IP 信誉库，被大量滥用的 IP 会被标记。地理位置一致性，如果账号注册地和请求来源地差异过大也可能触发。

判断当前出口 IP 的属性，可以查询公开的 IP 信息接口。

```bash
## 查询当前出口 IP 的基础信息
curl -s https://ipinfo.io/json

## 关注输出中的 org 字段，如果显示 hosting、datacenter、cloud 等关键词
## 说明是机房 IP，被风控的概率较高
```

```json
{
  "ip": "203.0.113.45",
  "city": "Los Angeles",
  "region": "California",
  "country": "US",
  "org": "AS64500 Example Hosting LLC",
  "timezone": "America/Los_Angeles"
}
```

org 字段里出现 Hosting、Datacenter、Cloud、VPS 这类词，基本可以判定为机房 IP。住宅 IP 的 org 通常显示的是本地 ISP 名称，比如 Comcast、Verizon、AT&T 这类。

解决方式是更换出口节点。住宅节点或专线节点的 IP 属性更接近真实用户，被风控的概率低。这也是前面配置域名分流规则时，把 Cursor 接口单独指向住宅策略组的原因。

## 十一、curl 探测接口健康状态的完整流程

把前面各层的判断整合成一套可执行的探测流程。这套命令在 Windows（PowerShell / WSL）和 macOS 上都能用，只是个别参数有差异。

第一步，确认 DNS 解析。

```bash
## macOS / Linux
dig api2.cursor.sh +short

## Windows PowerShell
Resolve-DnsName api2.cursor.sh
```

第二步，确认 TCP 可达性。

```bash
## 测试 443 端口是否开放
nc -zv api2.cursor.sh 443

## Windows
Test-NetConnection api2.cursor.sh -Port 443
```

第三步，确认 TLS 握手。

```bash
## 详细输出握手过程
curl -v --connect-timeout 10 https://api2.cursor.sh/ 2>&1 | head -50
```

关注输出里的几个关键行。

```text
* Trying 104.18.x.x:443...
* Connected to api2.cursor.sh (104.18.x.x) port 443
* TLSv1.3 (OUT), TLS handshake, Client hello (1)
* TLSv1.3 (IN), TLS handshake, Server hello (2)
* SSL certificate verify ok.
* Using HTTP/2
```

如果卡在 Trying 或 Connected 之后没有 Server hello，问题在链路或 SNI 阻断。如果出现 certificate verify failed，问题在证书链。如果握手完成但响应异常，问题在应用层或 IP 风控。

第四步，确认接口响应。

```bash
## 只看响应头和状态码
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://api2.cursor.sh/

## 完整响应
curl -s -D - https://api2.cursor.sh/ -o /dev/null
```

状态码 200 或 401 都说明接口可达（401 表示需要认证，属于正常）。403 或 429 说明 IP 被风控。超时或连接重置说明链路有问题。

第五步，对比代理前后的结果。

```bash
## 直连测试
curl -s -o /dev/null -w "direct: %{http_code} %{time_total}s\n" --noproxy '*' https://api2.cursor.sh/

## 走代理测试
curl -s -o /dev/null -w "proxy: %{http_code} %{time_total}s\n" -x http://127.0.0.1:7890 https://api2.cursor.sh/
```

两个结果对比，能判断问题出在代理本身还是出口链路。直连不通、代理通，说明代理工作正常，问题在直连被拦。两者都不通，说明出口链路或 IP 有问题。

## 十二、Windows 与 macOS 的差异处理

两个平台在几个细节上表现不同，需要分别处理。

证书存储方面，Windows 用系统证书存储，macOS 用 Keychain。导入代理根证书时，Windows 要导入"受信任的根证书颁发机构"，macOS 要导入"系统"钥匙串并设置为始终信任。

环境变量继承方面，Windows 从图形界面启动的程序会继承系统环境变量，macOS 从 Dock 启动的程序不继承 shell 环境变量。macOS 上要么从终端启动，要么把变量写到 launchd 配置里。

```bash
## macOS 通过 launchctl 设置全局环境变量
launchctl setenv HTTPS_PROXY http://127.0.0.1:7890
launchctl setenv HTTP_PROXY http://127.0.0.1:7890

## 注意这个设置重启后失效，需要配合 LaunchAgent 持久化
```

TUN 模式方面，Windows 需要安装 Wintun 驱动，macOS 需要授权系统扩展。两个平台都需要管理员权限。

网络栈方面，Windows 的 WinHTTP 和 WinINET 是两套代理设置，某些应用读前者某些读后者。macOS 的系统代理设置相对统一，但 Electron 对它的读取仍然受环回绕过规则影响。

## 十三、系统化排查清单

把整个排查流程整理成一张可执行的清单，遇到问题时从上往下逐项确认。

| 步骤 | 检查项 | 命令 / 操作 | 预期结果 |
| --- | --- | --- | --- |
| 1 | 环境变量 | env \| grep -i proxy | 看到 HTTP_PROXY / HTTPS_PROXY |
| 2 | 进程继承 | cat /proc/PID/environ | Cursor 进程能看到代理变量 |
| 3 | DNS 解析 | dig api2.cursor.sh | 返回 CDN 网段 IP |
| 4 | TCP 可达 | nc -zv api2.cursor.sh 443 | succeeded |
| 5 | TLS 握手 | curl -v https://api2.cursor.sh/ | SSL certificate verify ok |
| 6 | 接口响应 | curl -w "%{http_code}" | 200 或 401 |
| 7 | 证书信任 | node -e "..." | 正确加载 CA bundle |
| 8 | 分流规则 | Clash 日志 | 命中 AI-Residential 组 |
| 9 | 出口 IP | curl ipinfo.io/json | org 非 hosting 类 |
| 10 | MTU | ping -M do -s 1400 | 无 "Message too long" |

每一项确认通过后再进入下一项。这样能把问题精确定位到某一层，避免盲目尝试。

## 十四、常见误区与错误操作

排查过程中有几类操作看似有效，实际会引入新问题。

随意设置 NODE_TLS_REJECT_UNAUTHORIZED=0。这个变量会关闭所有 Node.js 进程的证书校验，包括 Cursor 主进程之外的任何 Node 应用。长期保留等于在自己机器上开了中间人后门。

把 NO_PROXY 设成通配。有人为了省事把 NO_PROXY 写成 `*`，结果所有请求都绕过代理，Cursor 的接口自然连不上。NO_PROXY 只应该包含真正的本地地址。

只配系统代理不配环境变量。前面反复强调过，Node.js 侧对系统代理的读取不完整，只配系统代理会让两条路径行为不一致。

分流规则顺序错误。把 DOMAIN-SUFFIX 规则放在 GEOIP 或 MATCH 之后，规则永远不会被命中，Cursor 流量走了兜底节点。

忽略 MTU。TUN 模式下 MTU 过大导致大包被丢弃，表现为握手成功但数据传输卡顿，很难联想到 MTU。

## 十五、长期稳定使用的配置建议

排查解决之后，把配置固化下来，避免下次重蹈覆辙。

环境变量写进 shell 配置文件，macOS 的 ~/.zshrc，Linux 的 ~/.bashrc，Windows 的系统环境变量。同时配一份 launchctl 或系统级的设置，覆盖从图形界面启动的场景。

代理工具使用 TUN 模式，配合 fake-ip DNS，让所有流量在 IP 层被接管，消除应用层代理设置的差异。

Clash 配置里为 Cursor 单独建策略组，指向住宅或专线节点，规则放在分流列表靠前位置。

代理根证书导入系统信任库，同时通过 NODE_EXTRA_CA_CERTS 让 Node.js 也信任，两条路径都覆盖。

定期用第十三节的清单做一次健康检查，特别是在更换节点或更新 Cursor 版本之后。

Cursor 的网络问题本质上是多层代理栈叠加的结果，Electron 的双网络栈、系统代理的环回绕过、Node.js 的证书模型、DNS 污染、IP 风控，每一层都可能成为故障点。把这套链路理解清楚，遇到问题时按层排查，比反复重启软件有效得多。
