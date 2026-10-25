---
title: Hysteria 2 与 TUIC 对比：UDP 拥塞控制与抗弱网原理
description: "从 QUIC 栈、Brutal 恒速发包与 BBR 拥塞控制入手，拆解 Hysteria 2 与 TUIC 的抗弱网原理，并给出 UDP 被 QoS 限速时的本地诊断流程与配置要点。"
pubDate: 2026-10-25
primaryKeyword: Hysteria2 与 TUIC 对比
secondaryKeywords:
  - Hysteria 2 Brutal 拥塞控制
  - TUIC BBR 拥塞控制
  - QUIC 协议代理
  - UDP 阻断与 QoS 限速
searchIntent: informational
contentType: wiki
funnelStage: consideration
verdict: Hysteria 2 的 Brutal 以预设速率恒速发包，在高丢包长 RTT 链路上吞吐更稳；TUIC 更贴近 QUIC 规范，握手与多路复用实现干净。两者成败都取决于本地运营商对 UDP 的处理策略，选型前先做 UDP 通路诊断。
faq:
  - q: Brutal 拥塞控制和 BBR 的本质差异在哪
    a: BBR 通过测量带宽与最小 RTT 建立发送模型并据此调整窗口，遇到丢包仍会做一定退让；Brutal 直接读取用户配置的上行下行速率，把它当作链路容量下限，按固定节奏发包，丢包只触发重传不触发降速。前者是测量驱动，后者是声明驱动。
  - q: 为什么同一条线路 TUIC 延迟更低但吞吐不如 Hysteria 2
    a: TUIC 完整遵循 QUIC 的拥塞控制与 pacing，0-RTT 与 1-RTT 握手优化让首包更快，但在 5% 以上丢包的长肥管道上，标准 CC 会把窗口压得很低。Hysteria 2 的 Brutal 不受丢包影响，代价是在链路实际容量低于配置速率时会加剧拥塞。
  - q: 运营商对 UDP 的 QoS 一般怎么表现
    a: 常见形态有三种，按 UDP 五元组做限速令牌桶、对超过阈值的 UDP 流做随机丢包、以及在省际出口对特定端口段直接丢弃。表现为 TCP 正常而 UDP 吞吐塌陷、QUIC 握手超时、视频通话卡顿，且往往在晚高峰加剧。
  - q: 如何判断本地网络是否适合 UDP 代理
    a: 用 iperf3 的 UDP 模式测不同包长与速率的丢包率，用 q 或 dig 检查 443/UDP 的连通性，用 mtr 观察是否在某一跳后 UDP 丢包突增，再对比同一目标 TCP 与 UDP 的吞吐差异。若 UDP 丢包率长期高于 10% 且无法通过换端口缓解，应优先考虑 TCP 系方案。
  - q: TUN 模式下两个协议有什么额外注意点
    a: TUN 会把三层包整体接管，需确认 MTU 与 QUIC 的 max datagram size 匹配，避免分片。Hysteria 2 在 TUN 下建议开启拥塞控制速率与实际带宽匹配，TUIC 则要关注 UDP relay 的会话表规模与 conntrack 上限。
related:
  - learn/protocols-explained
  - learn/iplc-vs-iepl
  - fix/peak-hour-slow
brandCta: "ermao-yun"
---

## 为什么要把这两个协议放在一起看

做骨干网运维的人对一件事有共识，过去十年里公网质量的提升主要发生在带宽维度，延迟和丢包这两个维度几乎没有实质改善。跨境链路尤其如此，中间要穿过多个 AS，任何一段拥塞、任何一次策略性限速，都会以丢包和抖动的方式传导到端到端。传统 TCP 系代理在这种链路上会陷入一个死循环，丢包触发拥塞窗口收缩，窗口收缩导致吞吐下降，吞吐下降让应用层重试，重试又加剧拥塞。

Hysteria 2 和 TUIC 都是在 QUIC 之上重新设计传输行为的方案，它们共享同一个底层假设，UDP 没有内核态的拥塞控制状态机，发送节奏完全由用户态程序决定，因此可以把“怎么发包”这件事从内核手里拿回来自己定义。两者的分歧点在于拿回来之后怎么用。Hysteria 2 选择了声明式速率，TUIC 选择了贴近规范的测量式拥塞控制。这个分歧决定了它们在弱网下的表现差异，也决定了它们各自适合什么样的链路。

这篇文章会把 QUIC 栈、TLS 1.3 握手、拥塞控制状态机、UDP QoS 识别机制这几层拆开讲，最后落到本地诊断流程。读完之后你应该能判断自己那条线路到底该选哪一个。

## QUIC 作为共同底座的技术细节

### 从 TCP 到 QUIC 的传输语义迁移

QUIC 把可靠传输、拥塞控制、流量控制全部搬到了用户态，运行在 UDP 之上。这个设计带来几个直接影响代理场景的特性。

第一是连接建立。TCP 需要三次握手，TLS 1.3 再叠加 1-RTT 或 0-RTT，完整路径至少 2 个 RTT 才能发出第一个应用数据。QUIC 把传输握手和 TLS 1.3 握手合并，首次连接 1-RTT，会话复用下可以做到 0-RTT。对于代理场景，这意味着首包延迟显著降低，尤其是 RTT 在 200ms 以上的跨境链路，省下的一个 RTT 就是实打实的体验差异。

第二是队头阻塞的范围。TCP 是单一有序字节流，一个包丢了，后面所有已到达的字节都要等在缓冲区里。QUIC 在连接内提供多条独立的 stream，丢包只阻塞所属 stream，其他 stream 继续交付。代理场景下这很关键，因为你可能同时在跑 HTTP 请求、DNS 查询、视频分片，它们之间不该互相拖累。

第三是连接迁移。QUIC 用 Connection ID 标识连接，不依赖四元组。手机从 Wi-Fi 切到蜂窝网络，IP 变了，连接可以继续。TCP 系方案在这个场景下必须重建连接。

### TLS 1.3 在 QUIC 里的集成方式

QUIC 不使用 TLS 记录层，而是把 TLS 1.3 的握手消息直接承载在 QUIC 的 CRYPTO 帧里。握手过程产生的密钥被 QUIC 直接用于 packet protection，每个加密级别（Initial、Handshake、0-RTT、1-RTT）对应不同的密钥。这个集成方式让 QUIC 的头部也是加密的，除了少数必要的明文字段（版本号、Connection ID、包号的部分比特），中间设备看不到更多信息。

对代理协议来说，这层加密带来了一个副作用，中间设备无法通过深度包检测识别应用层内容，只能依据 UDP 五元组、包长分布、包间隔这些元数据做分类。这也正是后面要讲的 UDP QoS 机制的识别基础。

### 用户态拥塞控制的自由度

QUIC 规范把拥塞控制定义为可插拔组件，RFC 9002 给出了 NewReno 的参考实现，但允许实现方替换。这个自由度是 Hysteria 2 和 TUIC 分道扬镳的技术前提。内核 TCP 的拥塞控制算法虽然也能换（通过 sysctl 设置 tcp_congestion_control），但受限于内核实现、ACK 时钟、SACK 处理等固定机制，可定制的空间有限。用户态 QUIC 则可以把整个发送节奏重写。

## Hysteria 2 的 Brutal 拥塞控制

### 设计动机

Hysteria 的作者对公网链路的判断是，现代骨干网的物理带宽其实很充裕，真正限制吞吐的是丢包导致的拥塞控制退让。一条 100ms RTT、5% 丢包的链路，标准拥塞控制算出来的可用带宽可能只有物理带宽的几分之一。如果用户明确知道自己这条线路的带宽上限（比如买的机场套餐标称 100Mbps），那么让协议直接按这个速率发包，丢包了就重传，不去猜测链路容量，吞吐就能稳定在标称值附近。

这就是 Brutal 的核心思想，把拥塞控制从测量问题变成配置问题。

### 发包模型

Brutal 的发送逻辑可以概括为以下几点。

- 用户配置上行和下行速率，单位是 Mbps。
- 发送端按配置速率计算发包间隔，用 pacing 的方式匀速发出。
- 收到丢包时只触发重传，不降低发送速率。
- 收到 ACK 时不做窗口扩张，因为窗口本来就不是限制因素。
- 如果实际链路容量低于配置速率，发送端不会感知，会持续以配置速率发包，导致链路队列堆积。

这个模型的数学表达很直接。设配置速率为 R，RTT 为 d，则任意时刻在途字节数约为 R × d。以 100Mbps 和 100ms 计算，在途约 1.25MB。这个量级的在途数据需要接收端有足够的缓冲区，也需要中间链路能承受。

### 配置示例

服务端配置（Hysteria 2 使用 YAML）：

```yaml
listen: :443

tls:
  cert: /etc/hysteria/server.crt
  key: /etc/hysteria/server.key

bandwidth:
  up: 200 mbps
  down: 500 mbps

auth:
  type: password
  password: your_strong_password

masquerade:
  type: proxy
  proxy:
    url: https://news.ycombinator.com/
    rewriteHost: true

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
  disablePathMTUDiscovery: false
```

客户端配置：

```yaml
server: your.server.address:443
auth: your_strong_password

bandwidth:
  up: 50 mbps
  down: 200 mbps

tls:
  sni: your.server.address
  insecure: false

socks5:
  listen: 127.0.0.1:1080

http:
  listen: 127.0.0.1:8080

quic:
  initStreamReceiveWindow: 8388608
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
```

`bandwidth` 字段是 Brutal 的关键。服务端的 up/down 指的是服务器视角的上行下行，客户端的 up/down 指的是客户端视角，两者方向相反，配置时要对齐。常见错误是把客户端 down 配成服务端 down，导致速率不匹配。

### Brutal 的适用边界

Brutal 在两种情况下会出问题。

第一种是配置速率远高于实际链路容量。比如线路实际只能跑 50Mbps，配置成 500Mbps，发送端会持续灌包，中间路由器的队列被打满，尾丢包率飙升，实际吞吐反而低于标准拥塞控制。更糟的是这会影响到同链路其他流量，属于典型的拥塞攻击行为。

第二种是链路上存在基于速率的限速策略。运营商如果对 UDP 做了令牌桶限速，Brutal 的恒速发包会持续触发限速器的丢弃，表现为大量重传但吞吐上不去。这种情况下降低配置速率到限速阈值以下反而能稳定。

## TUIC 的 QUIC 原生实现

### 协议定位

TUIC 的目标是做“尽可能贴近 QUIC 规范”的代理协议。它没有重写拥塞控制，使用标准的 BBR 或 Cubic，依赖 QUIC 的 pacing 和 ACK 机制。它的优化点集中在握手和会话管理上。

### 0-RTT 与握手优化

TUIC 完整支持 QUIC 的 0-RTT 会话恢复。客户端首次连接后缓存 session ticket，后续连接在第一个 flight 里就带上 0-RTT 数据，服务端验证 ticket 后直接处理。对于代理场景，这意味着已经建立过连接的客户端在重连时几乎零延迟。

TUIC 还支持 QUIC 的连接迁移和多路复用。一个 QUIC 连接里可以承载多个代理会话，减少了连接建立的开销。

### BBR 在 TUIC 里的行为

BBR 的核心是建立两个估计值，瓶颈带宽（BtlBw）和往返传播时间（RTprop）。发送速率由 BtlBw 和 RTprop 的乘积决定，处于 startup 阶段时指数增长，进入 probe bandwidth 阶段后周期性探测。BBR 对随机丢包的容忍度比 Cubic 高，因为它不把丢包当作拥塞的唯一信号。

但在高丢包链路上，BBR 仍然会受影响。丢包率高到一定程度，ACK 的到达节奏被打乱，BtlBw 的估计会偏低，发送速率随之下降。这就是为什么在 5% 以上丢包的链路上，TUIC 的吞吐通常低于 Brutal 配置合理的 Hysteria 2。

### 配置示例

TUIC 服务端配置（以 sing-box 为例）：

```json
{
  "inbounds": [
    {
      "type": "tuic",
      "listen": "::",
      "listen_port": 443,
      "users": [
        {
          "name": "user1",
          "password": "your_strong_password"
        }
      ],
      "congestion_control": "bbr",
      "auth_timeout": "3s",
      "zero_rtt_handshake": true,
      "heartbeat": "10s",
      "tls": {
        "enabled": true,
        "server_name": "your.server.address",
        "alpn": ["h3"],
        "certificate_path": "/etc/ssl/fullchain.pem",
        "key_path": "/etc/ssl/privkey.pem"
      }
    }
  ]
}
```

客户端配置：

```json
{
  "outbounds": [
    {
      "type": "tuic",
      "server": "your.server.address",
      "server_port": 443,
      "uuid": "your-uuid",
      "password": "your_strong_password",
      "congestion_control": "bbr",
      "udp_relay_mode": "native",
      "zero_rtt_handshake": true,
      "heartbeat": "10s",
      "tls": {
        "enabled": true,
        "server_name": "your.server.address",
        "alpn": ["h3"],
        "insecure": false
      }
    }
  ]
}
```

`congestion_control` 可选 bbr、cubic、new_reno。`udp_relay_mode` 可选 native 或 quic，native 用系统 UDP socket 转发，quic 把 UDP 流量封装进 QUIC stream，后者在 NAT 严格的环境下更稳但开销更大。

## 两种拥塞控制的参数对比

| 维度 | Hysteria 2 Brutal | TUIC BBR |
| --- | --- | --- |
| 速率决定方式 | 用户配置的固定速率 | 测量 BtlBw 与 RTprop |
| 丢包响应 | 只重传不降速 | 不把随机丢包当拥塞信号，但估计值会受影响 |
| 启动阶段 | 立即按配置速率发包 | startup 阶段指数增长 |
| 高丢包链路吞吐 | 稳定在配置值附近 | 随丢包率上升而下降 |
| 低带宽链路风险 | 配置过高会加剧拥塞 | 自适应，风险较低 |
| 对限速策略的敏感度 | 高，恒速发包易触发令牌桶 | 中，速率自适应但仍受丢包影响 |
| 配置复杂度 | 需要准确知道链路带宽 | 基本免配置 |
| 握手优化 | 支持 0-RTT | 完整支持 0-RTT 与连接迁移 |
| 适用场景 | 长 RTT、高丢包、带宽已知的跨境链路 | 链路质量中等、需要低延迟首包、多会话复用 |

这张表里最需要关注的是“对限速策略的敏感度”这一行。很多用户抱怨 Hysteria 2 在某个省份的线路上跑不动，根因往往协议本身之外，核心在于运营商的 UDP 限速策略与 Brutal 的恒速发包模型冲突。

## UDP 阻断与 QoS 限速的工程现实

### 运营商为什么对 UDP 敏感

UDP 无连接、无拥塞控制、无握手，这些特性让它成为放大攻击和资源滥用的首选载体。反射放大攻击（DNS、NTP、Memcached）全部基于 UDP。同时，QUIC 的普及让大量 UDP 流量从运营商的可观测范围内消失，传统的基于 TCP 状态机的流量分析失效。

运营商的应对策略通常分几层。

第一层是端口与协议识别。对 443/UDP 做深度包检测，识别 QUIC 版本与 ALPN。部分设备能识别出 Hysteria 2 和 TUIC 的特征（包长分布、初始包大小、pacing 模式）。

第二层是速率限制。基于五元组建令牌桶，超过阈值就丢包。这类限速往往不区分应用，只要是 UDP 大流量就触发。

第三层是省际出口的策略性丢弃。部分省份的出口设备对特定 UDP 端口段做概率丢弃，表现为丢包率随流量上升而上升。

第四层是直接阻断。对识别为代理特征的 UDP 流做 RST 或静默丢弃，连接建立阶段就失败。

### 典型症状与对应机制

| 症状 | 可能机制 | 验证方法 |
| --- | --- | --- |
| TCP 代理正常，UDP 代理握手超时 | 端口级阻断或 QUIC 识别丢弃 | 用 nc -u 测试目标端口连通性 |
| UDP 代理能连上但吞吐只有标称的 10% | 令牌桶限速 | iperf3 UDP 模式测不同速率下的丢包率 |
| 晚高峰丢包率飙升，白天正常 | 出口拥塞或策略性丢弃 | mtr 观察丢包发生的跳数 |
| 小流量正常，大流量断流 | 基于流量的阻断 | 逐步提高 iperf3 速率观察断点 |
| 连接频繁重置 | 特征识别后主动阻断 | 抓包看是否有 ICMP unreachable 或 RST |

### 抓包分析的基本方法

判断 UDP 是否被限速，抓包是最直接的手段。在客户端侧抓包，观察发送速率与接收速率的关系。

```bash
## 在客户端抓取与服务器之间的 UDP 流量
tcpdump -i eth0 -n -s 0 'udp and host your.server.address' -w hysteria.pcap

## 统计每秒发出的包数与字节数
tshark -r hysteria.pcap -q -z io,stat,1,"COUNT(frame) frame" -z io,stat,1,"SUM(frame.len) frame.len"
```

如果抓包显示发送端持续以配置速率发包，但接收端 ACK 稀疏，且重传率超过 20%，基本可以判定链路上有丢弃。进一步用 mtr 定位丢包发生的跳数。

```bash
## UDP 模式的 mtr，指定目标端口
mtr --udp --port 443 -c 100 your.server.address
```

如果丢包集中在某一跳之后，且该跳属于省际出口，那么限速发生在运营商侧，换端口或换协议是更现实的选择。

## 本地网络环境的诊断流程

### 第一步，确认 UDP 通路是否可用

先排除最基础的连通性问题。用 nc 或 socat 测试目标端口的 UDP 可达性。

```bash
## 服务端监听
nc -u -l 443

## 客户端发送
echo "test" | nc -u your.server.address 443
```

如果服务端收不到，说明 UDP 通路在某一层被阻断。注意有些网络会对非标准端口的 UDP 做更严格的限制，测试时用实际使用的端口。

### 第二步，测量 UDP 丢包率与速率的关系

用 iperf3 的 UDP 模式，从低速率开始逐步提高，观察丢包率的变化拐点。

```bash
## 服务端
iperf3 -s

## 客户端，从 10Mbps 开始
iperf3 -c your.server.address -u -b 10M -t 30

## 逐步提高到 50M、100M、200M
iperf3 -c your.server.address -u -b 50M -t 30
iperf3 -c your.server.address -u -b 100M -t 30
iperf3 -c your.server.address -u -b 200M -t 30
```

记录每个速率下的丢包率。如果在某个速率之后丢包率突然从 0 跳到 20% 以上，那个速率就是限速阈值。Brutal 的配置速率应该设在这个阈值以下，比如阈值的 70%。

### 第三步，对比 TCP 与 UDP 的吞吐差异

同一目标，分别用 TCP 和 UDP 测吞吐。如果 TCP 能跑满而 UDP 只有零头，说明 UDP 被区别对待。

```bash
## TCP 测试
iperf3 -c your.server.address -t 30

## UDP 测试
iperf3 -c your.server.address -u -b 100M -t 30
```

这个对比能快速区分“链路本身差”和“UDP 被限速”。前者 TCP 和 UDP 都差，后者只有 UDP 差。

### 第四步，观察时间维度的变化

限速策略往往与时间相关。晚高峰（19:00 到 23:00）的丢包率通常高于凌晨。在同一速率下分时段测试，记录丢包率曲线。

```bash
## 写一个简单的分时测试脚本
for i in $(seq 1 24); do
  echo "Hour $i: $(date)"
  iperf3 -c your.server.address -u -b 50M -t 10 -J | jq '.end.sum.lost_percent'
  sleep 3500
done
```

如果晚高峰丢包率显著高于其他时段，说明限速与出口拥塞或策略相关，这类线路用 Brutal 需要把配置速率调低，或者直接改用 TCP 系方案。

### 第五步，检查 MTU 与分片

QUIC 的初始包通常较大，如果路径 MTU 较小且 ICMP 被过滤，会出现分片丢失。用 ping 测试路径 MTU。

```bash
## 逐步减小包大小，找到不分片的最大值
ping -M do -s 1472 your.server.address
ping -M do -s 1400 your.server.address
ping -M do -s 1300 your.server.address
```

如果 1472 不通而 1300 通，说明路径 MTU 在 1300 到 1472 之间。Hysteria 2 和 TUIC 都支持配置 max datagram size，应该设为路径 MTU 减去 IP 和 UDP 头部开销。

```yaml
## Hysteria 2 客户端配置
quic:
  maxDatagramSize: 1350
```

## TUN 模式下的额外考量

TUN 驱动把三层包整体接管，代理程序需要处理 IP 包的转发和路由。这个模式下有几个容易出问题的点。

第一是 MTU。TUN 接口的 MTU 应该设为路径 MTU 减去封装开销。如果设得过大，封装后的包会超过路径 MTU 被分片或丢弃。Linux 下用 ip link 设置。

```bash
ip link set dev tun0 mtu 1400
```

第二是 conntrack 表规模。TUN 模式下所有流量都经过代理程序，UDP 会话数量可能很大。检查并调整 conntrack 上限。

```bash
sysctl net.netfilter.nf_conntrack_max
sysctl -w net.netfilter.nf_conntrack_max=262144
```

第三是 DNS 解析链路。TUN 模式下 DNS 查询也会被接管，如果代理程序的 DNS 处理有环路或超时，整个网络会表现为“能连 IP 不能解析域名”。建议在配置里显式指定上游 DNS，并开启 DNS 缓存。

```yaml
## Hysteria 2 的 TUN 配置片段
tun:
  name: hytun
  mtu: 1400
  timeout: 5m
  address:
    ipv4: 100.100.100.101/30
    ipv6: 2001:db8::1/126
```

## 选型决策树

把前面的分析收敛成一个可执行的判断流程。

第一步，做 UDP 通路诊断。如果 UDP 完全不通，直接排除这两个协议，考虑 TCP 系方案。

第二步，测限速阈值。如果 UDP 可用但存在明显的速率阈值，Hysteria 2 的配置速率设到阈值的 70% 以下，TUIC 用默认 BBR 即可。

第三步，看链路 RTT 和丢包率。RTT 大于 150ms 且丢包率大于 3% 的链路，Hysteria 2 的 Brutal 优势明显。RTT 小于 100ms 且丢包率低于 1% 的链路，两者差异不大，TUIC 的 0-RTT 和连接迁移更有价值。

第四步，看使用场景。需要频繁切换网络（移动设备）、需要多会话复用、首包延迟敏感的，TUIC 更合适。需要稳定大吞吐、链路质量已知且较差的，Hysteria 2 更合适。

第五步，看运维成本。Hysteria 2 需要准确配置带宽，配置错误会加剧拥塞。TUIC 基本免配置，但需要关注 UDP relay 的会话表规模。

## 常见误区澄清

一个流传很广的说法是 Brutal 能“突破”运营商的限速。这个理解是错的。Brutal 改变的是协议自身的发送节奏，它无法让运营商的令牌桶放行更多流量。当配置速率高于限速阈值时，Brutal 的恒速发包只会让更多包被丢弃，重传率上升，实际有效吞吐下降。正确的用法是把配置速率设在限速阈值以下，用稳定的发包节奏换取低重传率。

另一个误区是认为 TUIC 的 BBR 在高丢包链路上完全不可用。BBR 对随机丢包的容忍度比 Cubic 高，在 2% 到 3% 丢包的链路上表现仍然可以。只有在丢包率持续高于 5% 且 RTT 较大的情况下，Brutal 的优势才明显。

还有一个误区是把 UDP 阻断和 UDP 限速混为一谈。阻断是连接建立阶段就失败，限速是连接能建立但吞吐受限。两者的诊断方法和应对策略完全不同，前者只能换端口或换协议，后者可以通过调整配置速率缓解。

## 工程实践中的配置建议

对于 Hysteria 2，带宽配置的经验值是客户端 down 设为实测 UDP 吞吐的 80%，服务端 up 设为同一数值。如果不知道实测值，从保守值开始（比如 50Mbps），逐步提高，观察重传率。重传率超过 15% 说明配置过高。

对于 TUIC，congestion_control 选 bbr，udp_relay_mode 在 NAT 严格的环境下选 quic，其他情况选 native。zero_rtt_handshake 开启，但要注意 0-RTT 数据有重放风险，对安全性要求高的场景可以关闭。

两者的 keepAlive 都建议设为 10s 到 30s，太短会增加无效流量，太长会让 NAT 表项过期导致连接中断。

## 结语

Hysteria 2 和 TUIC 代表了 QUIC 代理的两个方向，一个把传输控制权交给用户配置，一个把控制权交给标准算法。前者在已知的劣质链路上能榨出更稳定的吞吐，后者在未知链路上更安全、更省心。真正的选型依据来自本地网络的基准数据，UDP 通路是否可用、限速阈值在哪里、丢包率随时间和速率如何变化，这些数据决定了配置参数，也决定了协议选择。把诊断流程走一遍，比看十篇对比文章都有用。
