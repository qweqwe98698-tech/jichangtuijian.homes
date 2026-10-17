---
title: sing-box 客户端规则集与入站配置指南：零基础实战
description: "从 JSON 结构、inbounds 入站、outbounds 出站到 rule_set 二进制规则集，系统讲解 sing-box 客户端配置教程，附完整可运行模版与 DNS 死循环排查方案。"
pubDate: 2026-10-17
primaryKeyword: sing-box 客户端配置教程
secondaryKeywords:
  - sing-box 规则集 rule-set
  - sing-box inbounds 配置
  - sing-box Clash 格式转换
  - sing-box 独立客户端使用
searchIntent: informational
contentType: tutorial
funnelStage: awareness
verdict: sing-box 的配置核心在于 inbounds、outbounds、route 三段式 JSON 结构与 rule_set 二进制规则集的配合；初学者最容易在 DNS 独立解析环节踩坑，把 DNS 出站指向代理本身导致解析死循环。本文给出可直接运行的完整模版与逐段排障路径。
faq:
  - q: sing-box 的 rule_set 规则集和 Clash 的 rule-providers 有什么区别？
    a: Clash 的 rule-providers 多为 YAML 或纯文本域名/IP 列表，运行时按行解析；sing-box 的 rule_set 采用编译后的二进制格式（.srs），加载时直接映射内存，匹配走前缀树与哈希表，规则量大时启动与匹配开销明显更低。两者语义相近，但 sing-box 支持 local 与 remote 两种来源，remote 可带 HTTP 缓存与 ETag 校验。
  - q: 为什么 sing-box 里 DNS 配置写错会导致全部流量无法解析？
    a: 当 route 规则把 DNS 查询也代理进 outbound，而该 outbound 的域名解析又依赖同一个 DNS 服务器时，形成解析环路。sing-box 提供 dns.independent 与 dns 出站直连的分离设计，必须保证 DNS 请求走 direct 或专门的 dns outbound，且该出站不依赖被代理的域名解析。
  - q: sing-box 的 tun 入站和 mixed 入站应该同时开吗？
    a: 桌面端常见做法是 mixed（HTTP+SOCKS 混合端口）配合 tun 同时启用。tun 负责接管系统全局流量（含不遵守代理设置的应用），mixed 供浏览器插件或命令行工具显式指定。移动端 GUI 通常只启用 tun，因为系统级 VPN 扩展已接管全部流量。
  - q: 订阅链接是 Clash YAML 格式，sing-box 能直接导入吗？
    a: 不能直接导入。sing-box 使用自有 JSON schema，需要经过格式转换。常见路径是用订阅转换服务输出 sing-box 专用 JSON，或在本地用脚本把 Clash 的 proxies 段映射为 sing-box 的 outbounds 段，再补齐 route 与 dns。转换后务必校验字段名，Clash 的 cipher 与 sing-box 的 method 命名不完全一致。
  - q: rule_set 的 remote 规则集更新失败会影响启动吗？
    a: 取决于配置。若 rule_set 标记为必选且下载失败，sing-box 启动会报错退出；若配置了 update_interval 与本地缓存，通常回退到上次缓存的 .srs 文件。生产环境建议把关键规则集放本地，remote 仅作增量更新，并设置合理的 download_detour。
related:
  - apps/clash-guide
  - apps/shadowrocket-guide
  - learn/protocols-explained
brandCta: "wuyou-lianjie"
---

## 为什么 sing-box 的配置门槛比 Clash 高一截

Clash 生态流行了很多年，绝大多数人第一次接触代理客户端就是从一份 YAML 开始的。YAML 的缩进直观、字段命名贴近自然语言，改一个节点只要复制一段文本。sing-box 走的是另一条路，它用 JSON 描述整个运行时，字段层级更深，语义更严格，一个逗号放错位置就会导致整个配置文件解析失败。

这种严格换来的是表达能力。sing-box 把入站、出站、路由、DNS、实验性功能拆成独立模块，每个模块有明确的 schema。它支持 TUN 驱动接管系统流量，支持编译后的二进制规则集，支持多路复用与 TLS 1.3 的细粒度参数。理解这套结构之后，你会发现它更像一个小型的网络策略引擎，配置文件的每一段都对应数据包处理链路上的一个决策点。

这篇文章面向零基础读者，从 JSON 结构讲起，逐段拆解 inbounds、outbounds、route 三大模块，给出完整可运行的模版，再讲清楚 DNS 独立解析这个最容易翻车的地方。读完之后你应该能独立维护一份 sing-box 客户端配置，并且在出问题时知道从哪一层开始查。

## sing-box 与 Clash 配置模型的本质差异

先建立一个整体认知。Clash 的配置文件是一份扁平的策略表，proxies 列出节点，proxy-groups 定义策略组，rules 按顺序匹配。sing-box 的配置是一张有向的处理图，数据包从 inbound 进入，经过 route 的规则匹配，被分配到某个 outbound，DNS 查询走独立的解析链路。

### 数据结构层面的对比

| 维度 | Clash (YAML) | sing-box (JSON) |
| --- | --- | --- |
| 序列化格式 | YAML，缩进敏感 | JSON，括号与逗号敏感 |
| 节点定义 | proxies 数组 | outbounds 数组，type 字段区分协议 |
| 策略组 | proxy-groups，支持 select/url-test/fallback | outbounds 内用 selector/urltest 类型表达 |
| 路由规则 | rules 字符串数组，如 DOMAIN-SUFFIX,google.com,PROXY | route.rules 对象数组，字段化表达 |
| 规则集 | rule-providers，多为文本/YAML | rule_set，支持二进制 .srs |
| DNS | dns 段，enhanced-mode 可选 fake-ip | dns 段，servers 与 rules 分离，支持独立解析 |
| 入站 | port / socks-port / mixed-port / tun | inbounds 数组，每项独立 type |
| TUN | 依赖内核或系统扩展 | 原生 tun 入站，参数细粒度控制 |

### 语义层面的差异

Clash 的 rules 是一串字符串，解析器按逗号切分，规则类型和目标是位置参数。sing-box 的 route.rules 是对象数组，每个对象可以带 domain、domain_suffix、geoip、rule_set、inbound、protocol 等多个条件字段，条件之间默认是逻辑与的关系。这种结构化表达让复杂策略更容易维护，也更容易出错。

另一个关键差异在 DNS。Clash 的 fake-ip 模式把域名解析交给客户端伪造，真实解析发生在代理侧。sing-box 的 DNS 模块更接近一个独立的解析器，你可以为不同域名指定不同的上游服务器，可以设置解析策略（prefer_ipv4、ipv4_only），可以用 dns.rules 做分流。灵活性的代价是配置复杂度上升，死循环解析的坑也主要出在这里。

## inbounds 入站配置：mixed 与 tun 的分工

入站是数据包进入 sing-box 的入口。客户端场景下最常用两种类型，mixed 和 tun。

### mixed 入站

mixed 同时监听 HTTP 代理和 SOCKS5 代理，共用一个端口。浏览器插件、命令行工具的 http_proxy 环境变量、curl 的 --proxy 参数都指向它。

```json
{
  "type": "mixed",
  "tag": "mixed-in",
  "listen": "127.0.0.1",
  "listen_port": 2080,
  "sniff": true,
  "sniff_override_destination": false,
  "domain_strategy": "prefer_ipv4"
}
```

几个字段值得展开。sniff 开启后 sing-box 会从 TLS ClientHello 的 SNI 或 HTTP Host 头里提取目标域名，这对路由匹配很关键，因为很多连接进来时只有 IP。sniff_override_destination 决定是否用嗅探到的域名覆盖原始目标地址，一般保持 false，避免影响某些依赖 IP 直连的应用。domain_strategy 控制出站时的地址族偏好，prefer_ipv4 表示优先 IPv4，在双栈环境下能减少一部分 IPv6 绕路问题。

listen 绑定 127.0.0.1 意味着只有本机可以访问。如果你需要局域网内其他设备共享这个代理，改成 0.0.0.0，同时要考虑防火墙和认证，裸奔的开放代理端口在公网上很快会被扫描到。

### tun 入站

tun 创建一个虚拟网卡，把系统流量从 IP 层接管进来。它解决的是那些不遵守系统代理设置的应用，比如某些游戏、原生客户端、Java 程序。

```json
{
  "type": "tun",
  "tag": "tun-in",
  "interface_name": "singbox-tun",
  "inet4_address": "172.19.0.1/30",
  "inet6_address": "fdfe:dcba:9876::1/126",
  "mtu": 9000,
  "auto_route": true,
  "strict_route": true,
  "stack": "gvisor",
  "sniff": true,
  "sniff_override_destination": false
}
```

interface_name 是虚拟网卡名，Windows 上会显示在网络适配器列表里。inet4_address 是 TUN 网段的网关地址，客户端流量会被路由到这个网段。mtu 设成 9000 是常见做法，TUN 是软件网卡，较大的 MTU 减少分片开销，真实链路的 MTU 由底层物理网卡和路径 MTU 发现机制处理。

auto_route 让 sing-box 自动添加系统路由表项，把默认路由指向 TUN。strict_route 在部分平台上启用更严格的路由规则，防止流量泄漏。stack 选择网络栈实现，gvisor 是用户态实现，兼容性好；system 走系统协议栈，性能略高但在某些平台上不稳定。初学者用 gvisor 更省心。

TUN 模式在 Windows 上需要管理员权限，在 macOS 上需要授权网络扩展，在 Linux 上需要 CAP_NET_ADMIN 能力。这些是操作系统层面的限制，跟 sing-box 本身无关。

### 两种入站并存

桌面端同时开 mixed 和 tun 是常见配置。tun 接管全局，mixed 给需要显式指定代理的软件用。两个入站的 tag 要唯一，route 规则里可以通过 inbound 字段区分来源，做更细的策略。

## outbounds 出站配置：节点、策略组与直连

出站定义流量的出口。sing-box 的 outbounds 数组里每一项是一个出站，type 字段决定它的行为。

### 节点出站

以 VLESS + TLS 为例：

```json
{
  "type": "vless",
  "tag": "node-hk-01",
  "server": "hk01.example.com",
  "server_port": 443,
  "uuid": "00000000-0000-0000-0000-000000000000",
  "flow": "xtls-rprx-vision",
  "tls": {
    "enabled": true,
    "server_name": "hk01.example.com",
    "utls": {
      "enabled": true,
      "fingerprint": "chrome"
    },
    "reality": {
      "enabled": true,
      "public_key": "PUBLIC_KEY_HERE",
      "short_id": "0123456789abcdef"
    }
  },
  "transport": {
    "type": "grpc",
    "service_name": "grpcsvc"
  }
}
```

TLS 段里的 utls 启用后会用 uTLS 库模拟浏览器的 ClientHello 指纹，fingerprint 可选 chrome、firefox、safari 等。这在面对基于 JA3/JA4 指纹识别的网络环境时有实际意义，因为标准 Go TLS 栈的握手特征与浏览器差异明显。REALITY 则进一步把 TLS 握手伪装成对真实站点的访问，public_key 和 short_id 必须与服务端一致。

transport 段描述传输层。gRPC、WebSocket、HTTP/2 各有适用场景。gRPC 在部分网络环境下比 WebSocket 更稳定，因为它复用了 HTTP/2 的多路复用。

### 策略组

sing-box 用 selector 和 urltest 两种类型表达策略组。

```json
{
  "type": "selector",
  "tag": "proxy",
  "outbounds": ["node-hk-01", "node-jp-01", "node-sg-01"],
  "default": "node-hk-01"
}
```

selector 是手动选择，客户端 GUI 里会显示成一个下拉列表。urltest 是自动测速选择：

```json
{
  "type": "urltest",
  "tag": "auto",
  "outbounds": ["node-hk-01", "node-jp-01", "node-sg-01"],
  "url": "https://www.gstatic.com/generate_204",
  "interval": "5m",
  "tolerance": 50
}
```

url 是测速目标，interval 是测速间隔，tolerance 是切换阈值（毫秒）。urltest 会周期性向 url 发起请求，选延迟最低的节点。tolerance 设成 50 意味着新节点要比当前节点快 50ms 以上才切换，避免在延迟接近的节点之间反复横跳。

### 直连与阻断

```json
{ "type": "direct", "tag": "direct" },
{ "type": "block", "tag": "block" }
```

direct 是直接出站，流量不经过任何代理。block 是阻断，连接被拒绝。这两个是路由规则的兜底目标。

## route 路由：rule_set 二进制规则集的核心用法

route 模块决定一个连接走哪个出站。它是 sing-box 配置里逻辑最密集的部分。

### 规则的基本结构

```json
{
  "route": {
    "rules": [
      {
        "domain_suffix": [".cn", ".com.cn"],
        "outbound": "direct"
      },
      {
        "rule_set": ["geosite-cn", "geoip-cn"],
        "outbound": "direct"
      },
      {
        "inbound": ["mixed-in"],
        "outbound": "proxy"
      }
    ],
    "final": "proxy",
    "auto_detect_interface": true
  }
}
```

规则按顺序匹配，命中即停。domain_suffix 匹配域名后缀，rule_set 引用预定义的规则集，inbound 匹配来源入站。final 是兜底出站，所有规则都没命中时走它。auto_detect_interface 让 sing-box 自动探测物理网卡，避免 TUN 流量回环。

### rule_set 的定义

rule_set 是 sing-box 相对 Clash 的一个明显改进。它支持两种来源：

```json
{
  "route": {
    "rule_set": [
      {
        "tag": "geosite-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
        "download_detour": "direct",
        "update_interval": "1d"
      },
      {
        "tag": "geoip-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
        "download_detour": "direct",
        "update_interval": "1d"
      },
      {
        "tag": "custom-list",
        "type": "local",
        "format": "source",
        "path": "./rules/custom.json"
      }
    ]
  }
}
```

format 为 binary 时加载 .srs 编译格式，为 source 时加载 JSON 源格式。remote 类型会按 update_interval 定期拉取，download_detour 指定下载走哪个出站，这里必须指向 direct，否则规则集更新本身要经过代理，代理又依赖规则集，形成循环依赖。

二进制 .srs 的优势在于加载速度。一个包含数十万条域名的 geosite 规则集，文本格式解析要几百毫秒到数秒，二进制格式直接内存映射，启动几乎无感。匹配阶段 sing-box 用前缀树处理域名后缀，用哈希表处理精确域名，用有序区间树处理 IP CIDR，规则量再大也能保持常数级查找。

### 规则的匹配维度

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| domain | 精确域名 | "www.example.com" |
| domain_suffix | 域名后缀 | ".google.com" |
| domain_keyword | 域名关键词 | "ads" |
| domain_regex | 域名正则 | "^ad[0-9]+\\." |
| geoip | IP 归属地 | "cn" |
| ip_cidr | IP 段 | "10.0.0.0/8" |
| port | 端口 | 443 |
| port_range | 端口范围 | "8000:9000" |
| network | 网络类型 | "tcp" / "udp" |
| protocol | 嗅探到的协议 | "http" / "tls" / "quic" |
| inbound | 来源入站 tag | "tun-in" |
| rule_set | 引用规则集 | ["geosite-cn"] |

这些字段可以组合。比如要匹配"来自 tun 入站、目标是 cn 域名、走 UDP 的 DNS 查询"，可以写：

```json
{
  "inbound": ["tun-in"],
  "rule_set": ["geosite-cn"],
  "network": "udp",
  "port": 53,
  "outbound": "dns-out"
}
```

规则顺序很重要。把 direct 规则放在前面，代理规则放在后面，是常见做法。如果反过来，先命中代理规则，后面的 direct 规则就永远不会生效。

## DNS 配置：独立解析与死循环的根源

DNS 是 sing-box 配置里最容易出错的部分，也是很多"能连上但打不开网页"问题的根源。

### DNS 模块结构

```json
{
  "dns": {
    "servers": [
      {
        "tag": "dns-direct",
        "address": "223.5.5.5",
        "detour": "direct"
      },
      {
        "tag": "dns-proxy",
        "address": "https://1.1.1.1/dns-query",
        "detour": "proxy"
      }
    ],
    "rules": [
      {
        "rule_set": ["geosite-cn"],
        "server": "dns-direct"
      }
    ],
    "final": "dns-proxy",
    "strategy": "prefer_ipv4",
    "independent_cache": true
  }
}
```

servers 定义上游 DNS 服务器，每个有 tag。address 支持 UDP、TCP、DoH、DoT 等协议。detour 指定这个 DNS 查询走哪个出站。rules 按域名分流到不同服务器，final 是兜底服务器。

### 死循环是怎么形成的

考虑一个错误配置：dns-proxy 的 detour 指向 proxy 出站，而 proxy 出站里的节点 server 字段是一个域名，比如 hk01.example.com。sing-box 要连接这个节点，先得解析 hk01.example.com，于是发起 DNS 查询，这个查询按规则走 dns-proxy，dns-proxy 的 detour 又是 proxy，proxy 又需要解析 hk01.example.com。环路形成，解析永远无法完成。

抓包时的表现是：DNS 查询反复发出，没有响应，或者响应超时后重试，最终所有依赖域名解析的连接全部失败。日志里通常能看到 DNS 查询超时或 context deadline exceeded。

### 避免方案

第一条原则：DNS 查询的出站不能依赖被代理的域名解析。dns-direct 的 detour 指向 direct，direct 出站不需要解析任何域名，安全。dns-proxy 如果要用 DoH，detour 可以指向 proxy，但前提是 proxy 里的节点地址是 IP 而非域名，或者节点域名的解析走 dns-direct。

第二条原则：节点域名的解析要单独处理。如果节点用域名，确保这个域名能被 dns-direct 解析。可以在 dns.rules 里给节点域名加一条规则指向 dns-direct：

```json
{
  "domain": ["hk01.example.com", "jp01.example.com"],
  "server": "dns-direct"
}
```

第三条原则：independent_cache 开启后，每个 DNS 服务器有独立缓存，避免不同上游的解析结果互相污染。这个字段在复杂分流场景下建议开启。

第四条原则：TUN 模式下，系统 DNS 会被劫持到 sing-box 的 DNS 模块。如果 dns 配置里没有正确处理，所有应用的域名解析都会失败。确保 dns.final 指向一个可用的服务器，且该服务器的 detour 不形成环路。

### DNS 解析链路与 IP 属性识别

理解 DNS 在 sing-box 里的完整链路有助于排查问题。一个连接进来，如果目标是域名，sing-box 先查 DNS 缓存，未命中则按 dns.rules 选择服务器，发起查询。查询结果返回后，sing-box 拿到 IP，再进入 route 规则匹配。如果 route 规则里有 geoip 条件，sing-box 会用这个 IP 去查 GeoIP 数据库，判断归属地。

这里有个细节：route 规则匹配时，如果原始目标是域名，domain 类规则先匹配；如果目标是 IP，geoip 和 ip_cidr 规则匹配。sniff 开启后，即使目标是 IP，sing-box 也能从 TLS SNI 里提取域名，让 domain 类规则生效。这就是 sniff 字段的价值。

IP 属性识别依赖 GeoIP 数据库，sing-box 内置了一份，也可以通过 geoip 字段指定外部数据库路径。数据库的准确性直接影响分流效果，定期更新是必要的。

## 完整可运行配置模版

把上面的模块拼起来，得到一份完整的客户端配置。这份模版适用于桌面端，同时开启 mixed 和 tun。

```json
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "dns": {
    "servers": [
      {
        "tag": "dns-direct",
        "address": "223.5.5.5",
        "detour": "direct"
      },
      {
        "tag": "dns-proxy",
        "address": "https://1.1.1.1/dns-query",
        "detour": "proxy"
      }
    ],
    "rules": [
      {
        "domain": ["hk01.example.com", "jp01.example.com"],
        "server": "dns-direct"
      },
      {
        "rule_set": ["geosite-cn"],
        "server": "dns-direct"
      }
    ],
    "final": "dns-proxy",
    "strategy": "prefer_ipv4",
    "independent_cache": true
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "127.0.0.1",
      "listen_port": 2080,
      "sniff": true,
      "sniff_override_destination": false
    },
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "singbox-tun",
      "inet4_address": "172.19.0.1/30",
      "inet6_address": "fdfe:dcba:9876::1/126",
      "mtu": 9000,
      "auto_route": true,
      "strict_route": true,
      "stack": "gvisor",
      "sniff": true,
      "sniff_override_destination": false
    }
  ],
  "outbounds": [
    {
      "type": "vless",
      "tag": "node-hk-01",
      "server": "hk01.example.com",
      "server_port": 443,
      "uuid": "00000000-0000-0000-0000-000000000000",
      "flow": "xtls-rprx-vision",
      "tls": {
        "enabled": true,
        "server_name": "hk01.example.com",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        }
      }
    },
    {
      "type": "vless",
      "tag": "node-jp-01",
      "server": "jp01.example.com",
      "server_port": 443,
      "uuid": "00000000-0000-0000-0000-000000000000",
      "flow": "xtls-rprx-vision",
      "tls": {
        "enabled": true,
        "server_name": "jp01.example.com",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        }
      }
    },
    {
      "type": "selector",
      "tag": "proxy",
      "outbounds": ["node-hk-01", "node-jp-01"],
      "default": "node-hk-01"
    },
    {
      "type": "urltest",
      "tag": "auto",
      "outbounds": ["node-hk-01", "node-jp-01"],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "5m",
      "tolerance": 50
    },
    {
      "type": "direct",
      "tag": "direct"
    },
    {
      "type": "block",
      "tag": "block"
    }
  ],
  "route": {
    "rules": [
      {
        "action": "sniff"
      },
      {
        "protocol": "dns",
        "outbound": "dns-out"
      },
      {
        "ip_is_private": true,
        "outbound": "direct"
      },
      {
        "rule_set": ["geosite-cn", "geoip-cn"],
        "outbound": "direct"
      },
      {
        "rule_set": ["geosite-ads"],
        "outbound": "block"
      },
      {
        "inbound": ["mixed-in"],
        "outbound": "proxy"
      }
    ],
    "rule_set": [
      {
        "tag": "geosite-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
        "download_detour": "direct",
        "update_interval": "1d"
      },
      {
        "tag": "geoip-cn",
        "type": "remote",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
        "download_detour": "direct",
        "update_interval": "1d"
      },
      {
        "tag": "geosite-ads",
        "type": "remote",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs",
        "download_detour": "direct",
        "update_interval": "1d"
      }
    ],
    "final": "proxy",
    "auto_detect_interface": true
  },
  "experimental": {
    "cache_file": {
      "enabled": true,
      "path": "cache.db"
    },
    "clash_api": {
      "external_controller": "127.0.0.1:9090"
    }
  }
}
```

这份模版里有个细节：route.rules 里有一条 protocol 为 dns 的规则，指向 dns-out。但 outbounds 里没有定义 dns-out。实际上 sing-box 会为 DNS 模块自动创建一个内部出站，tag 就是 dns-out，无需显式定义。这条规则的作用是把 DNS 查询从常规路由里剥离出来，交给 DNS 模块处理，避免 DNS 查询被误代理。

## Clash 格式转换的实操路径

订阅链接给的是 Clash YAML，sing-box 不能直接吃。转换有两条路。

### 在线订阅转换

多数订阅转换服务支持输出 sing-box 格式。把 Clash 订阅链接填入，选择 sing-box 作为目标格式，生成新的订阅链接。这种方式的优点是省事，缺点是转换服务对 sing-box 新字段的支持可能滞后，复杂的策略组和规则集不一定能完整映射。

### 本地脚本转换

用 Python 或 Node 脚本解析 Clash YAML，映射到 sing-box JSON。核心映射关系：

| Clash 字段 | sing-box 字段 |
| --- | --- |
| proxies[].type: vmess | outbounds[].type: "vmess" |
| proxies[].cipher | outbounds[].security |
| proxies[].alterId | outbounds[].alter_id |
| proxy-groups[].type: select | outbounds[].type: "selector" |
| proxy-groups[].type: url-test | outbounds[].type: "urltest" |
| rules | route.rules（需重写为对象） |
| rule-providers | route.rule_set |

转换时最容易出错的是 cipher 与 method 的命名差异，以及 TLS 相关字段的嵌套层级。Clash 把 tls、skip-cert-verify、servername 平铺在节点对象里，sing-box 要求它们嵌套在 tls 对象内。转换脚本要处理这层嵌套。

转换完成后必须做语法校验。sing-box 提供 check 子命令：

```bash
sing-box check -c config.json
```

这条命令会解析配置并报告语法错误和字段缺失，是上线前的必备步骤。

## iOS 与桌面端的载入与自动更新

### iOS 端

iOS 上的 sing-box GUI 客户端（如 Sing-box 官方 GUI 或第三方套壳）通过 Network Extension 实现 TUN。载入配置的方式通常是导入配置文件或订阅链接。

导入后，客户端会把配置写入应用沙盒，启动 VPN 时加载。自动更新订阅依赖客户端自身的定时任务，通常在应用内设置更新间隔。iOS 的后台限制较严，自动更新可能只在应用前台运行时触发，这一点要有心理预期。

iOS 端的 TUN 由系统 VPN 框架接管，配置里的 tun 入站参数部分由客户端覆写，inet4_address 等字段可能被忽略。mixed 入站在 iOS 上一般不需要开启，因为系统级 VPN 已经接管全部流量。

### 桌面端

Windows、macOS、Linux 上的 sing-box 客户端有 GUI 和命令行两种形态。命令行方式直接：

```bash
sing-box run -c config.json
```

自动更新订阅可以用系统定时任务配合脚本实现。Linux 上用 cron 或 systemd timer，macOS 上用 launchd，Windows 上用任务计划程序。脚本逻辑是拉取订阅、转换格式、校验、替换配置文件、重启 sing-box 进程。

```bash
#!/bin/bash
set -e
TMP=$(mktemp)
curl -sL "https://sub.example.com/clash" -o "$TMP.clash.yaml"
python3 convert.py "$TMP.clash.yaml" "$TMP.json"
sing-box check -c "$TMP.json"
mv "$TMP.json" /etc/sing-box/config.json
systemctl restart sing-box
```

这个脚本的关键在 sing-box check 这一步。校验不通过就不替换，保留上一份可用配置，避免更新失败导致断网。

### 配置载入的常见失败原因

| 现象 | 可能原因 | 排查方向 |
| --- | --- | --- |
| 启动即退出 | JSON 语法错误 | sing-box check 看报错行号 |
| 启动成功但无法上网 | DNS 死循环 | 检查 dns.servers 的 detour |
| 部分应用无法连接 | TUN 未接管或路由泄漏 | 检查 auto_route、strict_route |
| 规则集加载失败 | 网络不可达或 URL 失效 | 检查 download_detour 与 URL |
| 节点连接超时 | TLS 握手失败或端口被封 | 抓包看 ClientHello 与响应 |
| 速度异常慢 | MTU 或拥塞控制问题 | 检查 tun.mtu 与系统 TCP 参数 |

## 排障流程：从日志到抓包

出问题时按层排查，从配置到网络逐层收敛。

第一步，看日志。log.level 设成 debug 能看到详细的连接决策过程，包括每个连接命中了哪条规则、走了哪个出站、DNS 查询发往哪个服务器。

```json
{
  "log": {
    "level": "debug",
    "timestamp": true
  }
}
```

第二步，验证配置语法。sing-box check 是零成本的检查，任何改动后都应该跑一遍。

第三步，验证 DNS。用 dig 或 nslookup 向 sing-box 的 DNS 端口发查询，看是否返回。TUN 模式下系统 DNS 被劫持，可以用 curl 直接访问 IP 测试连通性，排除 DNS 因素。

第四步，抓包。tcpdump 或 Wireshark 抓 TUN 网卡和物理网卡，对比流量走向。TUN 网卡上看到 DNS 查询发出，物理网卡上没有对应的上游查询，说明 DNS 模块内部出了问题。物理网卡上看到 TLS ClientHello 但没有 ServerHello，说明握手被阻断或节点不可达。

第五步，检查路由表。TUN 模式下，系统路由表应该有指向 TUN 网段的默认路由。路由缺失意味着 auto_route 没生效，流量没进 TUN。

第六步，检查拥塞控制与 MTU。TCP BBR 在部分网络环境下比 CUBIC 表现更好，Linux 上可以通过 sysctl 开启。MTU 不匹配会导致大包分片或丢弃，表现为能打开网页但下载大文件失败。

```bash
sysctl -w net.ipv4.tcp_congestion_control=bbr
sysctl -w net.core.default_qdisc=fq
```

这两条命令在 Linux 服务端和客户端都适用。BBR 通过估算带宽和 RTT 来调整发送速率，在高丢包链路上比传统拥塞控制更激进，能提升吞吐。

## 与站内其他指南的衔接

sing-box 的配置理念与 Clash 有继承关系，理解 Clash 的规则模型有助于快速上手 sing-box。站内的 Clash 配置指南覆盖了策略组、规则匹配、订阅管理的基础概念，可以作为前置阅读。iOS 端的代理配置逻辑在 Shadowrocket 指南里有详细展开，与 sing-box GUI 的 TUN 接管机制可以对照理解。协议层面的 TLS 1.3 握手、uTLS 指纹、REALITY 原理在协议详解栏目里有更底层的拆解，配置里遇到 tls 段参数不确定时值得回查。

## 写在最后：配置是手段，链路质量是根本

sing-box 的配置文件再精巧，也只是把流量导向某个出口。真正决定体验的是出口本身的链路质量，包括带宽、延迟、丢包率、路由路径。配置能做的，是在多个出口之间做合理调度，在 DNS 层面减少解析延迟，在传输层面选择更稳定的协议组合。

初学者容易陷入一个误区，反复调整配置追求某个"最优解"。实际网络环境是动态的，今天最优的节点明天可能拥塞，规则集的更新也会改变分流结果。建立一套可维护的配置结构，配合定期校验和日志观察，比追求一次性完美配置更有价值。

把这份模版跑起来，观察日志里每个连接的决策路径，理解为什么某个域名走了 direct、某个走了 proxy，配置就真正变成你自己的工具了。
