---
title: OpenAI Realtime API 断流排查：WebRTC 与 UDP 代理配置
description: "从 WebRTC ICE 协商、STUN/TURN 与 UDP 分流链路拆解 OpenAI Realtime API 语音断流成因，给出 Clash 与 sing-box 的 UDP 代理及 livekit 域名路由配置与排障流程。"
pubDate: 2026-11-09
primaryKeyword: OpenAI Realtime API 断流
secondaryKeywords:
  - ChatGPT 语音模式打不开
  - OpenAI WebRTC 代理配置
  - UDP 穿透 STUN TURN 代理
  - Realtime API 延迟高
searchIntent: problem
contentType: troubleshooting
funnelStage: consideration
verdict: 语音断流多源于 UDP 未走代理或 ICE 协商失败，按 ICE、STUN/TURN、UDP 分流、DNS 四条链路逐段排查即可定位。
faq:
  - q: WebSocket 能连上，为什么语音还是断？
    a: Realtime API 的控制信令走 WSS/TCP，媒体流走 WebRTC 的 SRTP over UDP。信令握手成功只证明 TCP 443 可达，UDP 媒体通道被丢弃或直连泄露时，会话会在 ICE 阶段失败或中途超时断开。
  - q: Clash 里开了 UDP 转发为什么还不行？
    a: 需要同时满足三个条件，代理组支持 UDP、目标域名命中走代理的规则、节点上游允许 UDP 中继。很多机场节点只开放 TCP，UDP ASSOCIATE 请求会被拒绝，表现为 ICE 只有 host 候选没有 relay 候选。
  - q: TURN 必须自己搭吗？
    a: 不一定。OpenAI 侧会下发 STUN/TURN 配置，但企业内网或严格 NAT 环境下自建 TURN 作为中继兜底更稳。自建时优先 443/UDP 与 443/TCP 双通道，规避 UDP 被整体封锁的场景。
  - q: 延迟高但不断流，问题在哪？
    a: 常见于节点绕路、TURN 中继二次转发、MTU 分片导致重传。用 traceroute 与 mtr 观察路径跳数与丢包，检查节点 MTU 是否低于 1400，必要时下调 MSS 或启用 TCP BBR。
  - q: 如何快速确认是 UDP 被丢还是 DNS 污染？
    a: 先对 livekit 相关域名做 dig 校验解析结果，再用 nc -u 或 mtr 探测 UDP 可达性。DNS 污染表现为解析到异常 IP，UDP 被丢表现为解析正常但 ICE 候选无法连通。
related:
  - fix/chatgpt-blocked
  - apps/ai-split-tunneling
  - best/ai
brandCta: "weifeng-wangluo"
---

## 为什么 WebSocket 握手成功，语音流仍然中途断开

先把这条链路拆开看。OpenAI Realtime API 的会话建立分两段，控制面和媒体面走的是完全不同的协议栈。

控制面是标准的 HTTPS/WSS，跑在 TCP 443 上，TLS 1.3 握手，客户端发 `session.update`、服务端回 `session.created`，事件以 JSON 文本帧传输。这一段只要代理的 TCP 转发正常，握手几乎不会失败。很多人看到 `101 Switching Protocols` 就以为链路通了，其实这只证明 TCP 层可达。

媒体面才是真正承载语音的部分。Realtime API 的音频流走 WebRTC，底层是 SRTP over UDP，端口通常在 3478 到 40000 的高位区间浮动。会话建立前，客户端需要通过 ICE（Interactive Connectivity Establishment）收集候选地址，向 STUN 服务器发起 Binding 请求获取公网映射，必要时通过 TURN 服务器做中继。ICE 协商成功后，双方才在选定的候选对上跑 DTLS-SRTP 加密的音频流。

问题就出在这里。大量代理客户端默认只接管 TCP，UDP 流量要么被 TUN 网卡直接丢进黑洞，要么因为没有匹配到规则而从物理网卡直连出去。直连出去的 UDP 包源地址是本地公网 IP，OpenAI 的边缘节点在做 IP 属性识别时，会发现这个 IP 与 WSS 信令连接使用的代理出口 IP 不一致，于是触发风控，表现为媒体流建立后几十秒内被切断，或者干脆 ICE 协商超时，界面显示“语音模式打不开”。

这个现象在抓包里非常典型。WSS 连接稳定，ping/pong 帧正常，但 ICE 的 STUN Binding Request 发出去没有 Response，或者只有 host 候选、没有 srflx 和 relay 候选。候选列表不完整，ICE 就无法选出可用路径，会话卡在 `checking` 状态直到超时。

### ICE 候选收集的三种类型与断流对应关系

| 候选类型 | 来源 | 断流时的典型表现 | 网络层原因 |
| --- | --- | --- | --- |
| host | 本地网卡地址 | 仅 host 候选，无公网映射 | UDP 未出网或被 TUN 丢弃 |
| srflx | STUN 反射地址 | 有 host 无 srflx | STUN 请求被丢或响应被拦 |
| relay | TURN 中继地址 | 有 srflx 无 relay | TURN 的 UDP 通道不可达 |
| prflx | 对端反射地址 | 协商中途失效 | NAT 映射超时或端口漂移 |

抓包时重点看 `chrome://webrtc-internals` 或者浏览器开发者工具里的 ICE candidate 列表。如果只看到 host，基本可以判定 UDP 没走代理。如果 srflx 有但 relay 缺失，说明 STUN 通了但 TURN 的 UDP 中继被挡。

## 代理客户端只分流 TCP 时，UDP 去哪了

理解这个问题需要看 TUN 驱动的工作方式。Clash、sing-box 这类工具在 TUN 模式下会创建一张虚拟网卡，把默认路由指向它，应用层的所有流量（包括 UDP）理论上都会进到用户态处理。但这里有几个分叉点。

第一，配置里是否开启了 UDP 转发。Clash 的 `tun` 段有 `udp: true` 开关，sing-box 的 inbound 里对应 `"udp": true`。关掉这个开关，UDP 包进到 TUN 后直接丢弃，应用侧表现为发送成功但永远收不到响应。

第二，规则是否命中。即使开启了 UDP 转发，如果目标域名或 IP 没有匹配到走代理的规则，流量会走 `DIRECT` 从物理网卡出去。直连出去的 UDP 包源 IP 是本地公网地址，与 WSS 的代理出口 IP 不一致，OpenAI 侧的 IP 属性识别会判定为异常会话。

第三，节点上游是否支持 UDP。这是最容易被忽略的一层。代理协议里只有部分协议支持 UDP 中继，比如 Shadowsocks 的 UDP ASSOCIATE、VLESS 的 UDP over TCP、Trojan 的 UDP 转发。如果节点服务端没有开放 UDP，客户端发起的 UDP 会话会在节点侧被拒绝，ICE 拿不到 relay 候选。

第四，DNS 解析链路。如果 DNS 请求本身走了直连，解析 livekit 相关域名时可能被污染，返回一个不可达的 IP。即使 UDP 转发正常，连接的目标地址本身就是错的，ICE 依然失败。

### 排查顺序建议

1. 确认 TUN 模式与 UDP 开关已启用。
2. 确认规则命中，用 `clash` 的日志或 `sing-box` 的 `log` 输出观察 UDP 会话是否走代理。
3. 确认节点支持 UDP，通过节点侧日志或客户端 `udp` 测试验证。
4. 确认 DNS 解析走代理，避免污染。
5. 确认 MTU 与分片，避免大包被丢。

## Clash 侧配置：开启 UDP 与 livekit 域名路由

Clash 的配置核心在 `tun` 段和 `rules` 段。下面是一份针对 Realtime API 的最小可用片段。

```yaml
tun:
  enable: true
  stack: system
  dns-hijack:
    - any:53
  auto-route: true
  auto-detect-interface: true
  udp: true
  mtu: 1400

dns:
  enable: true
  listen: 0.0.0.0:53
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query
  fallback:
    - tls://1.1.1.1:853
  fallback-filter:
    geoip: true
    ipcidr:
      - 240.0.0.0/4

proxy-groups:
  - name: AI-UDP
    type: select
    proxies:
      - 节点A
      - 节点B
      - DIRECT

rules:
  - DOMAIN-SUFFIX,openai.com,AI-UDP
  - DOMAIN-SUFFIX,chatgpt.com,AI-UDP
  - DOMAIN-SUFFIX,livekit.cloud,AI-UDP
  - DOMAIN-SUFFIX,livekit.io,AI-UDP
  - DOMAIN-SUFFIX,rtc.livekit.cloud,AI-UDP
  - DOMAIN-KEYWORD,livekit,AI-UDP
  - GEOIP,US,AI-UDP
  - MATCH,AI-UDP
```

几个关键点值得说明。

`tun.udp: true` 是前提，没有它后面全白搭。`stack: system` 在多数 Linux 与 Windows 环境下兼容性更好，macOS 上可以试 `gvisor`。`mtu: 1400` 是为了规避部分链路对 1500 大包的分片丢弃，WebRTC 的 SRTP 包本身不大，但 ICE 的 STUN 响应偶尔会超过默认 MTU。

DNS 段用 `fake-ip` 模式，配合 `dns-hijack` 把 53 端口劫持到本地，确保解析请求也走代理。`fallback-filter` 里的 `geoip` 与 `ipcidr` 用于过滤污染结果。

规则段里 `DOMAIN-KEYWORD,livekit` 是兜底，因为 Realtime API 的媒体服务器域名会随区域变化，硬编码单一域名容易漏。`GEOIP,US` 是粗粒度兜底，实际使用中建议结合节点侧的实际出口做精细化。

### 验证 UDP 是否真的走了代理

在 Clash 开启后，用下面的命令做验证。

```bash
## 检查 TUN 网卡是否创建
ip addr show utun 2>/dev/null || ip addr show tun0

## 检查默认路由是否指向 TUN
ip route get 1.1.1.1

## 用 dig 验证 DNS 是否被劫持
dig livekit.cloud @127.0.0.1

## 用 nc 探测 UDP 可达性（STUN 端口）
nc -u -v -w 3 stun.l.google.com 19302

## 用 mtr 观察 UDP 路径丢包
mtr --udp -c 20 livekit.cloud
```

`nc -u` 返回 `succeeded` 只证明包发出去了，不代表收到响应。更可靠的方式是用 `nmap` 的 `-sU` 扫描，或者直接用 `stunclient` 工具测试 STUN Binding。

```bash
## 使用 stunclient 测试 STUN 映射
stunclient stun.l.google.com 19302
```

如果返回 `Mapped address` 且地址是节点出口 IP，说明 STUN 走了代理。如果返回本地公网 IP 或者超时，说明 UDP 没走代理。

## sing-box 侧配置：inbound UDP 与路由规则

sing-box 的配置结构比 Clash 更细，UDP 转发在 inbound 和 outbound 两层都有开关。

```json
{
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "sing-tun",
      "inet4_address": "172.19.0.1/30",
      "auto_route": true,
      "strict_route": true,
      "stack": "system",
      "sniff": true,
      "sniff_override_destination": true
    }
  ],
  "outbounds": [
    {
      "type": "shadowsocks",
      "tag": "proxy",
      "server": "节点地址",
      "server_port": 8388,
      "method": "aes-256-gcm",
      "password": "密码",
      "udp_over_tcp": false
    },
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "rules": [
      {
        "domain_suffix": [
          "openai.com",
          "chatgpt.com",
          "livekit.cloud",
          "livekit.io"
        ],
        "outbound": "proxy"
      },
      {
        "domain_keyword": ["livekit"],
        "outbound": "proxy"
      },
      {
        "ip_is_private": true,
        "outbound": "direct"
      }
    ],
    "auto_detect_interface": true,
    "final": "proxy"
  },
  "dns": {
    "servers": [
      {
        "tag": "remote",
        "address": "https://1.1.1.1/dns-query",
        "detour": "proxy"
      },
      {
        "tag": "local",
        "address": "223.5.5.5",
        "detour": "direct"
      }
    ],
    "rules": [
      {
        "domain_suffix": ["openai.com", "livekit.cloud"],
        "server": "remote"
      }
    ]
  }
}
```

`sniff: true` 与 `sniff_override_destination: true` 很关键。WebRTC 的 UDP 包目标地址是 IP 而非域名，开启嗅探后 sing-box 能从 TLS 或 QUIC 的 ClientHello 里提取 SNI，从而让域名规则命中。没有这个开关，UDP 包只能靠 IP 规则匹配，容易漏。

`udp_over_tcp: false` 表示优先走原生 UDP。如果节点侧 UDP 不稳定，可以改成 `true`，用 TCP 隧道封装 UDP，代价是延迟增加。这个取舍在弱网环境下值得考虑。

### sing-box 的 UDP 验证

```bash
## 查看 sing-box 日志中的 UDP 会话
journalctl -u sing-box -f | grep -i udp

## 检查 TUN 接口
ip addr show sing-tun

## 用 curl 的 HTTP/3 测试 QUIC（基于 UDP）
curl --http3 -I https://cloudflare-quic.com

## 用 dig 验证 DNS 分流
dig livekit.cloud @172.19.0.1
```

`curl --http3` 走的是 QUIC over UDP，如果返回 200 说明 UDP 链路整体可用。这个测试比单纯 ping 更有说服力，因为它验证了完整的 UDP 会话建立。

## STUN 与 TURN 的穿透细节

STUN 的作用是让客户端发现自己的公网映射地址。客户端向 STUN 服务器发 Binding Request，服务器回 Binding Response，里面带着客户端的公网 IP 和端口。这个映射地址就是 srflx 候选。

TURN 是 STUN 的扩展，当直连不可达时，双方通过 TURN 服务器中继媒体流。TURN 的分配请求（Allocate）需要鉴权，服务器分配一个中继地址，客户端把媒体流发到中继地址，由服务器转发给对端。

在代理环境下，STUN 和 TURN 的流量都必须走代理，否则映射地址会暴露本地公网 IP。这里有个细节，STUN 的 Binding Request 是明文 UDP，代理客户端需要能识别并转发这类非标准协议的 UDP 包。Clash 的 `udp: true` 和 sing-box 的 `sniff` 都能处理，但前提是节点上游支持 UDP 中继。

如果节点不支持 UDP，退而求其次的方案是自建 TURN 服务器，用 TCP 443 承载 TURN 流量。TURN over TCP 的兼容性最好，几乎不会被防火墙拦。配置上需要在客户端指定 TURN 服务器地址和凭据。

```bash
## 自建 coturn 的最小配置片段
## /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=realtime:密码
realm=example.com
external-ip=服务器公网IP
min-port=49152
max-port=65535
no-multicast-peers
```

启动后用 `turnutils_uclient` 做连通性测试。

```bash
turnutils_uclient -u realtime -w 密码 -p 3478 服务器地址
```

返回 `success` 说明 TURN 可用。然后在客户端侧把 TURN 地址填入 WebRTC 配置，或者通过 Realtime API 的 `session.update` 事件下发自定义 ICE 服务器。

## DNS 解析链路与 IP 属性识别

DNS 这一层经常被低估。Realtime API 的媒体服务器域名（livekit 相关）在不同区域解析到不同 IP，如果 DNS 请求走了直连，可能被污染返回一个不可达地址，或者返回一个地理位置错误的地址导致绕路。

更隐蔽的问题是 IP 属性识别。OpenAI 的边缘节点会检查 WSS 连接的源 IP 与 WebRTC 媒体流的源 IP 是否一致。如果 WSS 走了代理（出口 IP 是节点 A），而 UDP 直连出去（源 IP 是本地公网 IP），两者不一致，风控会判定为异常，表现为媒体流建立后被切断。

这个机制在抓包里能看到。WSS 的 TCP 连接五元组源地址是节点 IP，而 STUN Binding Request 的源地址是本地 IP。服务端在 ICE 协商阶段会比对这两个地址，不一致时可能直接拒绝 relay 候选或者在中途发 DTLS close_notify。

解决方式只有一个，让 UDP 和 TCP 走同一个出口。这要求代理规则对目标域名同时覆盖 TCP 和 UDP，且节点上游对两种协议都做中继。

### DNS 污染排查

```bash
## 对比本地解析与 DoH 解析结果
dig livekit.cloud @223.5.5.5
dig livekit.cloud @1.1.1.1
dig +https livekit.cloud @1.1.1.1

## 检查解析结果是否落在异常网段
dig +short livekit.cloud | xargs -I{} whois {}
```

如果本地解析返回的 IP 与 DoH 解析不一致，且本地结果落在保留网段或明显不属于 CDN 的地址，基本可以判定污染。此时需要把 DNS 请求也纳入代理，用 `dns-hijack` 或 sing-box 的 `detour` 把解析请求指向代理出口。

## 延迟高的成因与调优

断流解决后，下一个问题是延迟。Realtime API 对延迟敏感，端到端超过 300ms 就能感知到对话卡顿。延迟来源有几个层面。

物理链路层面，节点绕路是最常见原因。从国内到 OpenAI 的边缘节点，如果节点落地在美西，RTT 通常在 150ms 到 200ms，落地在欧洲则可能超过 250ms。用 `mtr` 观察路径跳数和每跳延迟，能快速定位绕路点。

协议层面，TURN 中继会引入额外一跳。媒体流从客户端到 TURN 服务器再到对端，延迟翻倍。如果直连可用，优先走 srflx 候选，TURN 只作为兜底。

传输层层面，TCP BBR 拥塞控制对 WSS 信令的吞吐有帮助，但对 UDP 媒体流无直接影响。WebRTC 有自己的拥塞控制（GCC），延迟主要受丢包和抖动影响。节点侧如果丢包率高，媒体流会触发重传和降码率，表现为声音断续。

MTU 层面，TUN 网卡的 MTU 设置过低会导致分片，过高会导致大包被丢。1400 是一个折中值，能兼容多数链路。如果节点侧支持 PMTUD，可以适当调高到 1420。

### 延迟排查命令

```bash
## 观察路径跳数与丢包
mtr -rw -c 50 livekit.cloud

## 测试 TCP 握手延迟
curl -o /dev/null -s -w "connect: %{time_connect}\nttfb: %{time_starttransfer}\n" https://api.openai.com/v1/models

## 测试 UDP 往返
nping --udp -p 3478 -c 20 节点地址

## 检查 TUN MTU
ip link show sing-tun | grep mtu
```

`mtr` 的输出里重点看中间跳的丢包率，如果某一跳开始丢包且后续跳持续丢包，说明该节点链路质量差。如果只有最后一跳丢包，可能是目标侧限速。

## 完整排障流程

把上面的分析串成一条可执行的流程。

第一步，确认现象。区分是“完全打不开”还是“建立后中途断开”。前者多为 ICE 协商失败，后者多为 IP 不一致触发的风控。

第二步，抓 ICE 候选。用浏览器开发者工具或 `chrome://webrtc-internals` 看候选列表。只有 host 候选说明 UDP 没出网，有 srflx 无 relay 说明 TURN 不可达，候选齐全但协商失败说明对端拒绝。

第三步，验证 UDP 转发。用 `stunclient` 或 `curl --http3` 测试 UDP 链路，确认包能出去且能收到响应。

第四步，验证规则命中。看代理客户端日志，确认 livekit 相关域名的 UDP 会话走了代理而非直连。

第五步，验证 DNS。对比本地解析与 DoH 解析，确认没有污染。

第六步，验证节点 UDP 支持。如果节点不支持 UDP，换节点或改用 TURN over TCP。

第七步，调优延迟。用 `mtr` 定位绕路，调整节点或 MTU。

这套流程覆盖了从应用层到网络层的完整链路，多数断流问题能在前三步定位。

## 与站内其他内容的衔接

Realtime API 的断流排查与 ChatGPT 网页版的访问问题是同一条链路上的不同环节。网页版打不开多与 TCP 443 的连通性和 TLS 握手有关，可以参考 `fix/chatgpt-blocked` 里的分层排查方法。如果需要在多个 AI 服务之间做精细化分流，`apps/ai-split-tunneling` 里的规则模板可以直接复用。对于节点选型的整体评估，`best/ai` 提供了基于协议支持与链路质量的对比维度。

语音断流的本质是 UDP 链路的完整性问题，解决了 UDP 转发、规则命中、DNS 解析三个环节，Realtime API 的会话稳定性会有明显改善。延迟的优化则需要结合节点位置与链路质量做取舍，这部分没有一劳永逸的配置，只能根据实际抓包数据逐步调整。
