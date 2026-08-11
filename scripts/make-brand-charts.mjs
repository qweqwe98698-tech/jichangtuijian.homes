/**
 * 依据 src/content/brands/*.json 的 claims 生成两类品牌图：
 *   1) <slug>-unlock.png    流媒体 / AI 解锁能力对照（品牌宣传口径，明确标注未复测）
 *   2) <slug>-topology.png  专线网络拓扑示意（架构示意，不含性能数据）
 * 版式与站点「纸面」设计令牌一致，与渠道提供的浅色测速图协调。
 * 运行：node scripts/make-brand-charts.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const BRAND_DIR = resolve(process.cwd(), 'src/content/brands');
const OUT_DIR = resolve(process.cwd(), 'public/images/brands');

const C = {
  paper: '#f7f4ee',
  surface: '#fffdf8',
  ink: '#211d16',
  muted: '#6b6353',
  line: '#ddd5c4',
  accent: '#20614b',
  amber: '#a05f13',
  grey: '#9a9384',
};
const SERIF = "'Noto Serif SC','Microsoft YaHei',SimSun,Georgia,serif";
const SANS = "'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif";

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 三态：claimed 品牌宣称 / none 未宣称 / partial 部分 */
function cellState(claim) {
  if (!claim) return { mark: '—', label: '未作宣称', color: C.grey };
  if (String(claim).includes('全')) return { mark: '✓', label: '品牌宣称全解锁', color: C.accent };
  return { mark: '✓', label: '品牌宣称支持', color: C.amber };
}

function unlockSvg(b) {
  const W = 1200;
  const groups = [
    {
      title: 'AI 工具',
      items: ['ChatGPT', 'Claude', 'Gemini'].map((n) => ({ name: n, ...cellState(b.claims.ai) })),
    },
    {
      title: '流媒体',
      items: ['Netflix', 'Disney+', 'YouTube'].map((n) => ({
        name: n,
        ...cellState(b.claims.streaming),
      })),
    },
    {
      title: '其他常用平台',
      items: [
        { name: 'HBO Max', ...cellState(b.claims.streaming) },
        { name: 'TikTok', ...cellState(b.claims.streaming) },
        { name: 'Spotify', ...cellState(b.claims.streaming) },
      ],
    },
  ];

  const headH = 128;
  const groupH = 132;
  const footH = 96;
  const H = headH + groupH * groups.length + footH;

  let body = '';
  groups.forEach((g, gi) => {
    const top = headH + gi * groupH;
    body += `<line x1="48" y1="${top}" x2="${W - 48}" y2="${top}" stroke="${C.line}" stroke-width="1"/>`;
    body += `<text x="48" y="${top + 34}" font-family="${SERIF}" font-size="21" font-weight="600" fill="${C.ink}">${esc(g.title)}</text>`;
    g.items.forEach((it, ii) => {
      const x = 300 + ii * 300;
      body += `<text x="${x}" y="${top + 34}" font-family="${SANS}" font-size="19" fill="${C.ink}">${esc(it.name)}</text>`;
      body += `<text x="${x}" y="${top + 72}" font-family="${SERIF}" font-size="30" font-weight="600" fill="${it.color}">${esc(it.mark)}</text>`;
      body += `<text x="${x + 34}" y="${top + 71}" font-family="${SANS}" font-size="15" fill="${C.muted}">${esc(it.label)}</text>`;
    });
  });

  const footTop = headH + groupH * groups.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="${C.surface}" stroke="${C.line}" stroke-width="1"/>
  <rect x="24" y="24" width="6" height="${H - 48}" fill="${C.accent}"/>
  <text x="48" y="76" font-family="${SERIF}" font-size="34" font-weight="600" fill="${C.ink}">${esc(b.name)} · 流媒体与 AI 解锁能力对照</text>
  <text x="48" y="106" font-family="${SANS}" font-size="16" fill="${C.amber}">数据性质：品牌宣传口径（渠道资料）· 机场决策室尚未独立复测，不代表实测结果</text>
  ${body}
  <line x1="48" y1="${footTop}" x2="${W - 48}" y2="${footTop}" stroke="${C.line}" stroke-width="1"/>
  <text x="48" y="${footTop + 36}" font-family="${SANS}" font-size="15" fill="${C.muted}">「✓」= 品牌方声明支持；「—」= 品牌资料中未作声明，不等于不可用。解锁状态随 IP 池变动，请以试用实测为准。</text>
  <text x="48" y="${footTop + 62}" font-family="${SANS}" font-size="15" fill="${C.muted}">复测方法见 jichangtuijian.homes/methodology/</text>
  <text x="${W - 48}" y="${footTop + 62}" text-anchor="end" font-family="${SERIF}" font-size="15" fill="${C.grey}">机场决策室 · jichangtuijian.homes</text>
</svg>`;
}

function topologySvg(b) {
  const W = 1200;
  const H = 760;
  const line = b.lineTypes[0] ?? '专线';
  const isIepl = /IEPL|IPLC|专线/.test(line);
  const midLabel = isIepl
    ? `${line.replace('（品牌口径）', '')} 跨境传输（品牌口径）`
    : '公网跨境传输';
  const box = (x, y, w, h, title, sub) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.surface}" stroke="${C.ink}" stroke-width="1.5" rx="3"/>
    <text x="${x + w / 2}" y="${y + 34}" text-anchor="middle" font-family="${SERIF}" font-size="21" font-weight="600" fill="${C.ink}">${esc(title)}</text>
    <text x="${x + w / 2}" y="${y + 60}" text-anchor="middle" font-family="${SANS}" font-size="15" fill="${C.muted}">${esc(sub)}</text>`;
  const arrow = (x, y1, y2, label) => `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 12}" stroke="${C.ink}" stroke-width="1.5"/>
    <polygon points="${x - 6},${y2 - 12} ${x + 6},${y2 - 12} ${x},${y2}" fill="${C.ink}"/>
    ${label ? `<text x="${x + 18}" y="${(y1 + y2) / 2 + 5}" font-family="${SANS}" font-size="15" fill="${C.muted}">${esc(label)}</text>` : ''}`;

  const cx = 330;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="${C.surface}" stroke="${C.line}" stroke-width="1"/>
  <rect x="24" y="24" width="6" height="${H - 48}" fill="${C.accent}"/>
  <text x="48" y="76" font-family="${SERIF}" font-size="34" font-weight="600" fill="${C.ink}">${esc(b.name)} · 线路结构示意</text>
  <text x="48" y="106" font-family="${SANS}" font-size="16" fill="${C.amber}">图示性质：依据品牌宣传的线路类型绘制的架构示意图，非实测路由，不含性能数据</text>

  ${box(180, 150, 300, 82, '用户设备', '手机 / 电脑 / 路由器')}
  ${arrow(cx, 232, 292, `加密流量（${esc(b.protocols[0] ?? 'VLESS')}）`)}
  ${box(180, 292, 300, 82, '国内接入入口', 'BGP / 三网优化入口')}

  <line x1="${cx}" y1="374" x2="${cx}" y2="446" stroke="${C.accent}" stroke-width="7"/>
  <polygon points="${cx - 8},434 ${cx + 8},434 ${cx},452" fill="${C.accent}"/>
  <text x="${cx + 24}" y="416" font-family="${SANS}" font-size="16" font-weight="600" fill="${C.accent}">${esc(midLabel)}</text>
  <text x="${cx + 24}" y="440" font-family="${SANS}" font-size="14" fill="${C.muted}">${isIepl ? '宣称不经公网国际出口，晚高峰理论上受拥塞影响较小' : '经公网国际出口，晚高峰受拥塞影响'}</text>

  ${box(180, 452, 300, 82, '海外落地节点', '香港 / 日本 / 新加坡 / 美国 / 台湾')}

  <line x1="${cx}" y1="534" x2="${cx}" y2="586" stroke="${C.ink}" stroke-width="1.5"/>
  <line x1="${cx}" y1="586" x2="760" y2="586" stroke="${C.ink}" stroke-width="1.5"/>
  <line x1="760" y1="586" x2="760" y2="612" stroke="${C.ink}" stroke-width="1.5"/>
  <polygon points="754,612 766,612 760,624" fill="${C.ink}"/>
  <line x1="${cx}" y1="586" x2="${cx}" y2="612" stroke="${C.ink}" stroke-width="1.5"/>
  <polygon points="${cx - 6},612 ${cx + 6},612 ${cx},624" fill="${C.ink}"/>
  ${box(180, 624, 300, 76, '常规互联网访问', '网页 / 办公 / 下载')}
  ${box(610, 624, 300, 76, 'AI 与流媒体服务', `${b.claims.ai ? 'AI 宣称支持 · ' : ''}${b.claims.streaming ? '流媒体宣称支持' : '解锁能力未宣称'}`)}

  <text x="${W - 48}" y="${H - 44}" text-anchor="end" font-family="${SERIF}" font-size="15" fill="${C.grey}">机场决策室 · jichangtuijian.homes</text>
  <text x="48" y="${H - 44}" font-family="${SANS}" font-size="15" fill="${C.muted}">线路真伪的核验方法见 /guides/stability-signals/ 的晚高峰七日观测法</text>
</svg>`;
}

const files = readdirSync(BRAND_DIR).filter((f) => f.endsWith('.json'));
let n = 0;
for (const f of files) {
  const b = JSON.parse(readFileSync(resolve(BRAND_DIR, f), 'utf8'));
  if (!b.images?.unlock) continue;
  const slug = f.replace('.json', '');
  await sharp(Buffer.from(unlockSvg(b)))
    .png()
    .toFile(resolve(OUT_DIR, `${slug}-unlock.png`));
  await sharp(Buffer.from(topologySvg(b)))
    .png()
    .toFile(resolve(OUT_DIR, `${slug}-topology.png`));
  n += 2;
}
console.log(`已生成 ${n} 张品牌图 → public/images/brands/`);
