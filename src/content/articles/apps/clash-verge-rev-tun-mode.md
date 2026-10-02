---
title: Clash Verge Rev TUN 模式完整配置：虚拟网卡与全局分流
description: "从 Mihomo 内核 TUN 栈原理出发，拆解 Clash Verge Rev 虚拟网卡配置、gvisor/system/mixed 堆栈差异、Wintun 驱动兼容性与 DNS 防泄漏路由排查。"
pubDate: 2026-10-02
primaryKeyword: Clash Verge Rev TUN模式
secondaryKeywords:
  - Clash Verge Rev 虚拟网卡
  - TUN 模式绕过系统代理
  - gvisor 还是 system 堆栈
  - Clash Verge DNS 防泄漏
searchIntent: problem
contentType: tutorial
funnelStage: awareness
verdict: TUN 模式把三层流量整体接管，绕开系统代理的覆盖盲区；配置核心在于选对 stack、锁定 DNS 劫持链路、并让 strict-route 与 auto-route 协同，避免终端、WSL2、Docker 出现回环或泄漏。
faq:
  - q: Clash Verge Rev 的 TUN 模式和系统代理到底差在哪？
    a: 系统代理只修改 WinINET/WinHTTP 或应用自身的代理设置，只覆盖遵循系统代理的应用。TUN 模式创建一块三层虚拟网卡并改写路由表，把默认路由指向该网卡，未主动读取代理配置的程序（终端、游戏、Docker、WSL2）也会被接管。
  - q: gvisor 和 system 堆栈应该怎么选？
    a: system 走操作系统内核的 TCP/IP 协议栈，吞吐高、CPU 占用低，适合大流量下载与高并发。gvisor 在用户态实现协议栈，隔离性好、兼容性稳，适合内核受限或对稳定性要求高的场景。mixed 让 TCP 走 system、UDP 走 gvisor，是多数桌面场景的折中方案。
  - q: 开启 TUN 后 DNS 还是被污染怎么办？
    a: 检查 tun.dns-hijack 是否包含 any:53 与 tcp://any:53，确认 dns.enable 为 true 且 nameserver 使用 DoH/DoT 加密解析，同时关闭系统网卡的明文 DNS。若仍污染，多半是 IPv6 DNS 未接管或应用硬编码了 DNS 服务器地址。
  - q: WSL2 和 Docker 容器为什么有时绕过 TUN？
    a: WSL2 使用独立的 Hyper-V 虚拟交换机与 NAT 网段，Docker Desktop 也有自己的 vEthernet 适配器。需要在 Mihomo 配置中把这些网段加入路由接管范围，或关闭 Docker 的独立 DNS 转发，让容器流量回到宿主默认路由。
  - q: strict-route 打开后断网是什么原因？
    a: strict-route 会强制所有流量必须经过 TUN，一旦规则集把网关自身流量也匹配进代理，就会形成回环。需要在规则最前面为网关地址、局域网段、TUN 网段设置 DIRECT，并保留 meta 地址的直连。
related:
  - apps/clash-guide
  - apps/ai-split-tunneling
  - fix/nodes-all-timeout
brandCta: "guangsu-yun"
---

TUN 模式在 Clash Verge Rev 里是一个分水岭式的功能。它把代理从“应用层协商”下沉到“网络层接管”，代价是你要理解虚拟网卡、路由表、DNS 劫持和协议栈实现这几件事之间的耦合关系。很多人打开 TUN 开关后发现浏览器能通、终端不通，或者反过来，问题几乎都出在这几个环节的配置不匹配上。下面按原理、堆栈选型、驱动、配置、场景接入、排障的顺序，把这条链路完整走一遍。

## TUN 模式在 Mihomo 内核里做了什么

理解 TUN 之前，先把系统代理的边界说清楚。系统代理的本质是修改注册表里的 WinINET 设置，或者通过环境变量告诉应用“请把请求发给 127.0.0.1:7890”。只有主动读取这些配置的程序才会走代理。终端里的 curl、git、ssh，游戏客户端，Docker 容器，WSL2 里的进程，默认都不看这套设置，于是出现“浏览器通了但命令行不通”的经典现象。

TUN 模式换了一条路径。Mihomo 内核通过驱动创建一块虚拟网卡，给它分配一个私有网段地址（默认 198.18.0.1/30 之类），然后修改系统路由表，把默认路由或指定网段路由指向这块网卡。操作系统认为这块网卡就是出口，所有三层 IP 包被送到这里，内核从网卡读取原始 IP 数据包，交给内部协议栈还原成 TCP/UDP 流，再按规则分流。

这条链路里有两个关键动作。第一个是路由接管，决定了哪些流量会被送进 TUN。第二个是 DNS 劫持，决定了域名解析请求会不会被内核截获并转发到加密 DNS。两者缺一，TUN 要么漏流量，要么解析被污染。

从数据包视角看，一个 TCP 连接的生命周期是这样的：

```text
应用 write() -> 内核 TCP/IP 栈封装 -> 路由表匹配 -> 命中 TUN 网卡
-> 内核把 IP 包写入 TUN 设备 -> Mihomo 从 TUN 读取原始包
-> 内部协议栈还原流 -> 规则匹配 -> 命中代理节点
-> 封装为上游协议（VLESS/Trojan/Hysteria2 等）-> 发出
```

反向数据包沿原路返回，Mihomo 重新封装成 IP 包写回 TUN 设备，内核收到后交给对应 socket。整个过程对应用透明，应用完全感知不到代理存在。

### 路由接管与 auto-route 的边界

`auto-route` 打开后，内核会自动添加路由规则，把默认路由指向 TUN 网卡，同时为 TUN 网段和网关地址添加例外。这一步在 Linux 上通过 netlink 完成，在 Windows 上通过 WFP 和路由 API 完成。问题在于，某些 VPN 客户端、虚拟机软件、企业安全软件也会改路由表，顺序竞争会导致接管不完整。

`strict-route` 是更激进的一层。它要求所有流量必须走 TUN，任何试图绕过 TUN 的流量会被丢弃。这个选项适合防止泄漏，但配置不当会直接断网，因为一旦规则把网关自身流量也代理了，回环就形成了。

## 三种网络堆栈的取舍：gvisor、system、mixed

Mihomo 的 TUN 支持三种协议栈实现，这是选型里最容易被忽略但影响最大的部分。

system 堆栈直接调用操作系统内核的 TCP/IP 协议栈处理流量。数据包从 TUN 读出来后，通过一个内核态的转发路径重新注入本地协议栈。优点是吞吐高、CPU 占用低、延迟小，因为走的是内核优化过的路径。缺点是对内核版本和系统配置有依赖，某些精简系统或容器环境可能不可用。

gvisor 堆栈是 Google 在用户态实现的网络协议栈。Mihomo 把 IP 包交给 gvisor，由它在用户态完成 TCP 状态机、拥塞控制、重组等全部工作。优点是隔离性好、跨平台一致、不依赖内核特性，在受限环境里表现稳定。缺点是每个包都要在用户态处理，CPU 占用明显更高，高并发或大流量场景下吞吐会打折扣。

mixed 堆栈是折中方案，TCP 流量走 system，UDP 流量走 gvisor。这样 TCP 大流量享受内核性能，UDP（DNS、QUIC、游戏）用 gvisor 保证兼容性。

| 维度 | system | gvisor | mixed |
| --- | --- | --- | --- |
| TCP 吞吐 | 高，接近内核直连 | 中等，受用户态处理限制 | 高（TCP 走 system） |
| UDP 兼容性 | 依赖内核 | 好，用户态完整实现 | 好（UDP 走 gvisor） |
| CPU 占用 | 低 | 高 | 中等 |
| 稳定性 | 受内核配置影响 | 高，隔离性好 | 高 |
| 适用场景 | 大流量下载、高并发 | 兼容性优先、受限环境 | 桌面日常、混合负载 |
| 内存占用 | 低 | 较高 | 中等 |

选型建议按负载特征来。桌面日常使用、浏览网页加视频，mixed 是稳妥选择。纯下载机或需要跑高并发连接的服务，用 system 榨性能。运行在容器、精简系统或内核受限环境里，gvisor 更省心。切换堆栈后如果出现连接重置或 UDP 无响应，优先怀疑堆栈与当前系统不匹配。

## Windows 驱动：Wintun 与 TAP 的兼容性差异

Windows 平台上的 TUN 依赖虚拟网卡驱动。历史上 Clash 系客户端用过 TAP-Windows（OpenVPN 项目维护）和 Wintun（WireGuard 项目维护）两种。

Wintun 是当前主流。它是一个轻量级的三层虚拟网卡驱动，性能好、安装干净、无需签名兼容性折腾，Windows 10 1809 及以上原生支持。Mihomo 和 Clash Verge Rev 默认使用 Wintun，驱动文件随程序分发，首次开启 TUN 时会自动安装。

TAP-Windows 是较老的方案，工作在三层但驱动模型偏旧，兼容性在部分系统上会出现网卡状态异常、驱动签名冲突。除非有特殊兼容需求，否则不需要手动切换。

安装 Wintun 时常见的几个问题：

驱动未签名或被安全软件拦截。部分企业环境强制驱动签名策略，Wintun 安装会失败。此时需要确认系统版本，或临时调整驱动签名策略。

网卡残留。反复开关 TUN 或异常退出后，设备管理器里可能残留多块 Wintun 网卡，导致路由冲突。清理方法是在设备管理器里卸载所有 Wintun 适配器，删除驱动包，然后重新开启 TUN 让程序重建。

与 Hyper-V、WSL2 的 vEthernet 适配器冲突。WSL2 和 Docker Desktop 会创建自己的虚拟网卡，路由表里可能有多条默认路由竞争。这需要靠配置里的路由例外来处理，后文展开。

## config.yaml 中 tun 节点的完整配置

下面是一份可直接参考的 TUN 配置片段，覆盖 stack、dns-hijack、auto-route、strict-route 等关键字段。

```yaml
tun:
  enable: true
  stack: mixed
  device: Mihomo
  mtu: 9000
  auto-route: true
  auto-detect-interface: true
  strict-route: false
  dns-hijack:
    - any:53
    - tcp://any:53
  route-exclude-address:
    - 192.168.0.0/16
    - 10.0.0.0/8
    - 172.16.0.0/12
    - 127.0.0.0/8
  route-address:
    - 198.18.0.1/30
  exclude-package:
    - "com.example.bypassapp"

dns:
  enable: true
  listen: 0.0.0.0:1053
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - "*.lan"
    - "*.local"
    - "localhost.ptlogin2.qq.com"
  nameserver:
    - https://223.5.5.5/dns-query
    - https://1.1.1.1/dns-query
  fallback:
    - tls://8.8.8.8:853
    - https://doh.pub/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4
```

逐字段说明。

`stack` 决定协议栈，前文已展开。`device` 是虚拟网卡名，Windows 上会显示为对应名称的适配器。`mtu` 设置网卡最大传输单元，9000 是常见值，某些网络环境下过大 MTU 会导致分片问题，可回退到 1500。

`auto-route` 让内核自动接管路由。`auto-detect-interface` 自动探测物理出口网卡，多网卡环境下建议保持开启。

`strict-route` 默认关闭。开启后强制所有流量走 TUN，防泄漏能力强但容错低，配置规则时要把网关和局域网放行。

`dns-hijack` 是 DNS 劫持的核心。`any:53` 表示劫持所有发往 53 端口的 UDP 请求，`tcp://any:53` 覆盖 TCP 53。这样即使应用硬编码了 DNS 服务器地址，请求也会被内核截获并交给 Mihomo 的 DNS 模块处理。

`route-exclude-address` 列出不走 TUN 的网段，局域网和回环必须排除，否则内网访问和本机通信会断。

`fake-ip` 模式配合 TUN 是常见组合。域名解析返回一个 198.18.x.x 的假 IP，应用拿这个假 IP 发起连接，内核在收到连接时根据假 IP 反查真实域名，再走规则分流。这套机制让基于域名的规则在 TUN 下依然有效。

## DNS 解析链路与防泄漏

TUN 模式下 DNS 是最容易出问题的环节。完整链路应该是这样的：

```text
应用发起 DNS 查询 -> 命中 TUN 路由 -> 被 dns-hijack 截获
-> 交给 Mihomo DNS 模块 -> 按 nameserver/fallback 分组查询
-> 加密 DNS（DoH/DoT）返回结果 -> fake-ip 模式返回假 IP
-> 应用用假 IP 连接 -> 内核反查域名 -> 规则匹配 -> 代理
```

防泄漏的关键点：

确保 `dns.enable` 为 true，且 `listen` 端口被 TUN 劫持覆盖。如果 DNS 模块没启用，劫持来的查询无处可去，解析直接失败。

nameserver 使用加密 DNS。明文 UDP 53 查询在链路上可被污染，DoH/DoT 把查询封装在 TLS 里，中间设备无法篡改。fallback 用于国内域名走国内 DNS、国外域名走可信 DNS 的分流。

关闭系统网卡的明文 DNS。即便 TUN 劫持了 53 端口，某些应用会直接向配置的 DNS 服务器发起 DoH 查询，绕过劫持。检查系统网络设置，把 DNS 改为自动或指向本地，避免应用直连外部 DNS。

IPv6 是常见泄漏点。如果系统启用了 IPv6 且 TUN 未接管 IPv6 路由，AAAA 查询和 IPv6 连接会走物理网卡出去。配置里 `dns.ipv6: false` 可以抑制 AAAA 解析，或在 TUN 配置里显式接管 IPv6 网段。

验证是否泄漏，可以在开启 TUN 后访问 DNS 泄漏检测面板，观察解析服务器归属。如果显示的是本地 ISP 的 DNS，说明劫持链路没生效。

## 终端、WSL2、Docker 接入 TUN 流量

TUN 的最大价值就是让这些“不读系统代理”的环境自动被接管。前提是路由配置正确。

### 终端命令行

终端里的 curl、git、ssh 默认不读系统代理。TUN 接管默认路由后，这些工具的流量会被内核送进 TUN，无需额外配置。验证方法：

```bash
curl -v https://www.google.com
```

如果返回正常且没有设置 http_proxy 环境变量，说明 TUN 接管成功。若失败，检查路由表：

```bash
## Linux
ip route show
## Windows
route print
```

确认默认路由指向 TUN 网卡。若物理网卡仍持有默认路由且优先级更高，需要调整接口跃点数或依赖 auto-route 的接管。

### WSL2

WSL2 运行在 Hyper-V 虚拟机上，通过 vEthernet 适配器与宿主通信，有自己的 NAT 网段（通常 172.x.x.x）。默认情况下 WSL2 的流量走自己的虚拟网卡，不经过宿主 TUN。

让 WSL2 接入 TUN 有几种思路。较新的 WSL2 版本支持镜像网络模式，在 `.wslconfig` 里配置：

```ini
[wsl2]
networkingMode=mirrored
dnsTunneling=true
autoProxy=true
```

镜像模式下 WSL2 共享宿主网络接口，TUN 的路由接管自然覆盖 WSL2 流量。dnsTunneling 让 DNS 查询通过宿主解析，避免 WSL2 内部 DNS 污染。

如果使用 NAT 模式，需要把 WSL2 的网段加入 TUN 的路由接管范围，或在 WSL2 内部手动设置 DNS 指向宿主 TUN 网关地址。

### Docker 容器

Docker Desktop 同样创建独立虚拟网卡。容器默认用自己的 bridge 网络和内置 DNS 转发（127.0.0.11）。容器流量经 NAT 出宿主，理论上会被宿主默认路由接管，但 Docker 的内置 DNS 可能绕过劫持。

处理方式有两种。一是让容器 DNS 指向宿主 TUN 网关，或在 docker run 时指定 `--dns`。二是关闭 Docker 的独立 DNS 转发，让容器直接使用宿主解析。Linux 环境下可以直接用 host 网络模式，容器共享宿主网络命名空间，TUN 接管自然生效。

```bash
docker run --network host your-image
```

验证容器流量是否走 TUN，可以在容器内执行 curl 并观察 Mihomo 的连接日志，看是否出现对应连接记录。

## 排查 DNS 污染与死循环路由

### DNS 污染排查步骤

第一步，确认劫持生效。在终端执行：

```bash
nslookup www.google.com 8.8.8.8
```

如果返回的是 fake-ip 网段地址（198.18.x.x），说明劫持成功。如果返回真实 IP 或超时，劫持没生效，检查 `dns-hijack` 配置和 TUN 是否真正接管了 53 端口。

第二步，确认解析走加密通道。查看 Mihomo 日志里的 DNS 查询记录，确认使用的是 DoH/DoT。若看到明文 UDP 查询，说明 nameserver 配置未生效。

第三步，检查 IPv6。执行：

```bash
nslookup -type=AAAA www.google.com
```

若返回真实 IPv6 地址且系统启用了 IPv6，流量可能走物理网卡泄漏。关闭系统 IPv6 或在 TUN 里接管 IPv6 路由。

第四步，检查应用硬编码 DNS。某些应用内置 DoH 服务器地址，直接向外部发起加密查询，绕过系统 DNS。这类情况需要靠规则拦截对应域名，或禁用应用的 DoH 功能。

### 死循环路由排查

死循环的典型表现是开启 strict-route 后完全断网，或者连接建立后立即超时。

成因是代理自身的出站流量也被 TUN 接管，形成“代理流量走代理”的闭环。Mihomo 需要把发往上游节点的流量走物理网卡直出，而不是再次进入 TUN。

排查步骤：

确认 `auto-detect-interface` 开启，让内核自动识别物理出口。手动指定时确保 `interface-name` 指向正确的物理网卡。

检查规则集，在最前面为以下地址设置 DIRECT：

```yaml
rules:
  - IP-CIDR,127.0.0.0/8,DIRECT
  - IP-CIDR,192.168.0.0/16,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  - IP-CIDR,198.18.0.0/16,DIRECT
  - DST-PORT,7890,DIRECT
  - MATCH,PROXY
```

198.18.0.0/16 是 fake-ip 网段，必须直连，否则假 IP 反查会回环。代理监听端口也要直连，避免内核自身流量被再次代理。

若使用 strict-route，确认 `route-exclude-address` 包含所有内网段和网关地址。strict-route 会丢弃未匹配的流量，配置遗漏就会断网。

排查时可以先关闭 strict-route，确认基础连通性，再逐步开启并观察哪条规则导致问题。Mihomo 的日志级别调到 debug 可以看到每个连接的路由决策，定位回环点。

## 性能调优与内核参数

TUN 模式下的吞吐受协议栈、MTU、拥塞控制算法共同影响。

拥塞控制方面，TCP BBR 在高延迟链路上比传统 CUBIC 有明显优势。Linux 下可以启用：

```bash
sysctl -w net.ipv4.tcp_congestion_control=bbr
sysctl -w net.core.default_qdisc=fq
```

BBR 通过测量带宽和往返时延来调整发送速率，避免了丢包触发的激进降速，在跨境链路上表现更稳。

MTU 设置要匹配链路。TUN 网卡 MTU 设为 9000 时，如果底层链路不支持巨帧，会出现分片和重传。跨境链路通常 MTU 在 1400 到 1500 之间，过大 MTU 反而拖慢。可以逐步下调 MTU 观察吞吐变化。

system 堆栈下，内核的 `somaxconn`、`tcp_max_syn_backlog` 等参数影响高并发连接建立。大流量场景可以适当调高。

gvisor 堆栈的性能瓶颈在用户态处理，减少规则匹配复杂度、精简规则集能降低单包处理开销。

## 配置检查清单

部署 TUN 模式前，按这个清单逐项核对：

- TUN 已启用，stack 与负载特征匹配
- 虚拟网卡驱动正常安装，设备管理器无异常
- auto-route 开启，默认路由指向 TUN 网卡
- dns-hijack 覆盖 UDP 和 TCP 的 53 端口
- dns.enable 为 true，nameserver 使用加密 DNS
- fake-ip 网段与 route-exclude-address 不冲突
- 内网段、回环、代理端口在规则最前面直连
- strict-route 开启时确认例外完整
- WSL2 和 Docker 的网络模式已适配
- IPv6 泄漏已处理

这套配置跑通后，终端、容器、虚拟机里的流量都会统一走规则分流，系统代理覆盖不到的死角被补齐。后续如果遇到节点全超时，可以对照 `fix/nodes-all-timeout` 里的排查流程，从 DNS 解析、节点连通性、规则匹配三个层面逐一验证。分流策略的细化可以参考 `apps/ai-split-tunneling` 里按域名和地区拆分的思路，把 AI 服务、流媒体、办公流量分开处理，减少规则冲突。
