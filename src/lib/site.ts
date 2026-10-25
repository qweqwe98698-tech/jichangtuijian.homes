/** 全站常量与栏目定义。域名只在 astro.config.mjs 与此处声明。 */

export const SITE = {
  domain: 'jichangtuijian.homes',
  url: 'https://jichangtuijian.homes',
  name: '机场决策室',
  titleSuffix: '｜机场决策室',
  description:
    '机场决策室：先讲标准，再谈推荐。为中文用户提供机场选择标准、场景推荐、深度评测、机场对比与风险观察，所有数据标注验证状态。',
  locale: 'zh-CN',
} as const;

export type SectionKey = 'guides' | 'best' | 'reviews' | 'vs' | 'apps' | 'learn' | 'fix' | 'risk';

export interface SectionDef {
  key: SectionKey;
  name: string;
  /** 栏目一句话职责（Hub 页与面包屑使用） */
  tagline: string;
  inNav: boolean;
}

export const SECTIONS: SectionDef[] = [
  { key: 'guides', name: '开始选择', tagline: '不知道怎么选？先建立你的选择标准。', inNav: true },
  { key: 'best', name: '场景推荐', tagline: '按你的真实使用场景给出候选方案。', inNav: true },
  { key: 'reviews', name: '机场评测', tagline: '按公开方法逐项核验的深度评测。', inNav: true },
  { key: 'vs', name: '机场对比', tagline: '两个候选放在同一张取舍表上。', inNav: true },
  {
    key: 'apps',
    name: '客户端教程',
    tagline: 'Clash、Shadowrocket 等客户端从零上手。',
    inNav: true,
  },
  { key: 'learn', name: '知识库', tagline: '协议、线路、原生 IP——看懂宣传话术。', inNav: false },
  { key: 'fix', name: '故障排查', tagline: '连不上、超时、不解锁，按顺序排查。', inNav: false },
  { key: 'risk', name: '风险观察', tagline: '跑路信号、套餐风险与运营状态记录。', inNav: true },
];

export const sectionMap: Record<string, SectionDef> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s]),
);

/** 主导航：商业承接页前置，栏目 Hub 其次；控制在 7 项以内 */
export const NAV_ITEMS = [
  { href: '/airport-ranking/', label: '机场排行榜' },
  { href: '/brand-library/', label: '品牌库' },
  ...SECTIONS.filter((s) => s.inNav).map((s) => ({ href: `/${s.key}/`, label: s.name })),
];

/**
 * 移动端展开菜单补充项：**未进主导航**的栏目。
 * Header 用 [...NAV_ITEMS, ...MOBILE_NAV_EXTRA] 拼接渲染，
 * 所以这里不能再列 SECTIONS 中 inNav: true 的栏目（/vs/ 曾重复出现两次）。
 */
export const MOBILE_NAV_EXTRA = [
  { href: '/learn/', label: '知识库' },
  { href: '/fix/', label: '故障排查' },
  { href: '/search/', label: '搜索' },
];

/** 站点最近编辑动作日期（顶部信息行显示；发布新内容时更新） */
export const LAST_SITE_UPDATE = '2026-10-25';

/**
 * 站长平台验证。拿到验证码后填在这里即可，无需改模板。
 * 留空时不会输出任何 meta，避免产生空标签。
 * - Google Search Console：选「HTML 标记」方式，把 content 值填入 googleSiteVerification
 * - Bing Webmaster Tools：同理填 bingSiteVerification
 * 也可以改用 DNS 验证，那样这里保持留空即可。
 */
export const SITE_VERIFICATION = {
  google: '',
  bing: '',
} as const;

/**
 * IndexNow：Bing / Yandex 等支持的主动推送协议。
 * 生成一个 8–128 位的十六进制密钥填在这里，同时把同名文件放到 public/<key>.txt（内容就是该密钥）。
 * 填好后即可用 scripts/indexnow-submit.mjs 推送 URL。留空表示未启用。
 */
export const INDEXNOW_KEY = '6dd7ea9a7a8507d010b3c6e6822bb46a';
