import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 文章：src/content/articles/<section>/<slug>.md
 * 目录名即栏目（guides/best/reviews/vs/apps/learn/fix/risk），URL = /<section>/<slug>/
 */
const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string().max(60),
    description: z.string().min(50).max(170),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('editorial'),
    tags: z.array(z.string()).default([]),

    // SEO 契约（SEO-STRATEGY.md §3）
    primaryKeyword: z.string(),
    secondaryKeywords: z.array(z.string()).default([]),
    searchIntent: z.enum(['informational', 'commercial', 'transactional', 'problem']),
    contentType: z.enum([
      'recommendation',
      'review',
      'comparison',
      'tutorial',
      'wiki',
      'troubleshooting',
      'risk',
    ]),
    funnelStage: z.enum(['awareness', 'consideration', 'decision']),

    // GEO / 信任
    verdict: z.string().optional(), // 快速结论（Verdict Box，可独立摘录）
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    lastVerified: z.coerce.date().optional(),
    dataSource: z.string().optional(),

    // 内链与商业承接
    related: z.array(z.string()).default([]), // 形如 "guides/how-to-choose"
    brandCta: z.string().optional(), // 品牌档案 slug，触发评测层 CTA

    // 教程扩展
    platform: z.string().optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    howToSteps: z.array(z.string()).default([]), // 非空且为教程时输出 HowTo Schema

    // 风险扩展
    riskLevel: z.enum(['low', 'medium', 'high', 'unknown']).optional(),

    draft: z.boolean().default(false),
  }),
});

/** 品牌档案：唯一允许承载商业链接的数据层 */
const brands = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/brands' }),
  schema: z.object({
    name: z.string(),
    /** 品牌别名 / 英文名，用于品牌词覆盖与站内搜索 */
    aliases: z.array(z.string()).default([]),
    tier: z.enum(['premium', 'mid', 'budget']),
    positioning: z.string(), // 一句公开可核的定位描述
    background: z.string(),

    // ── 商务信息（来源：品牌方/渠道提供，属二级来源，需标注口径） ──
    /** 起步套餐价格描述，例："17 元 / 月 · 110GB" */
    priceFrom: z.string().nullable().default(null),
    /** 每 GB 单价（元），用于性价比排序；无法计算时为 null */
    pricePerGb: z.number().nullable().default(null),
    /** 起步套餐的计费周期 */
    billingCycle: z.enum(['monthly', 'quarterly', 'yearly', 'unknown']).default('unknown'),
    couponCode: z.string().nullable().default(null),
    couponNote: z.string().nullable().default(null),
    launchYear: z.string().nullable().default(null),
    /** 品牌主打卖点（宣传口径原样收录，前台需标注「品牌口径」） */
    highlights: z.array(z.string()).default([]),
    clients: z.array(z.string()).default([]),
    /** 解锁与场景能力：品牌公开说明，无统一测试数据时前台如实标注 */
    claims: z
      .object({
        streaming: z.string().nullable().default(null),
        ai: z.string().nullable().default(null),
        selfClient: z.boolean().default(false),
        subscriptionImport: z.boolean().default(false),
      })
      .default({}),
    /** 图片资产（public 下的绝对路径） */
    images: z
      .object({
        speedtest: z.string().nullable().default(null),
        unlock: z.string().nullable().default(null),
        topology: z.string().nullable().default(null),
      })
      .default({}),
    /** 适配的场景标签，用于专题页筛选：ai / streaming / budget / iepl / gaming / newbie */
    scenarios: z.array(z.string()).default([]),

    /**
     * 编辑主推位。这是**含商业因素的编辑选择**，与 /airport-ranking/ 的计算型榜单相互独立：
     * 榜单按可复算维度排序、不受商业关系影响；主推位是本站的主动推荐，必须明示披露。
     * rank 越小越靠前。reason 必须写出真实依据，且包含一条保留意见。
     */
    editorialPick: z
      .object({
        rank: z.number().int().positive(),
        reason: z.string(),
        caveat: z.string(),
      })
      .nullable()
      .default(null),

    /**
     * 第三方测速面板导出数据（由 scripts/apply-panel-data.mjs 从 measurements/panel/ 写入）。
     * 一级来源：有真实测量过程，但非本站执行——本站不做统一环境下的独立测速。
     */
    /**
     * 面板数据存疑说明。非空时表示该品牌的测速面板与其他品牌重复（同一份导出被挂多个品牌名），
     * 归属澄清前不得展示任何面板数据与面板截图。
     */
    panelDisputed: z.string().nullable().default(null),

    panel: z
      .object({
        tool: z.string().nullable().default(null),
        threads: z.number().nullable().default(null),
        backend: z.string().nullable().default(null),
        durationSec: z.number().nullable().default(null),
        pingCount: z.number().nullable().default(null),
        protocolShown: z.string().nullable().default(null),
        totalNodes: z.number().nullable().default(null),
        /** 面板上标注的实际测试时间（含时区）。有它就不需要靠账户信息推断 */
        testedAt: z.string().nullable().default(null),
        /** 是否落在本站定义的晚高峰窗口（20:30–22:30）内 */
        inPeakWindow: z.boolean().nullable().default(null),
        /** 测试时间上界（由套餐到期等账户信息行推断），无法推断时为 null */
        testedBefore: z.string().nullable().default(null),
        regions: z
          .array(
            z.object({
              name: z.string(),
              nodes: z.number(),
              latencyMinMs: z.number().nullable().default(null),
              latencyMaxMs: z.number().nullable().default(null),
              avgSpeedMinMB: z.number().nullable().default(null),
              avgSpeedMaxMB: z.number().nullable().default(null),
              maxSpeedMaxMB: z.number().nullable().default(null),
            }),
          )
          .default([]),
        anomalies: z.array(z.string()).default([]),
      })
      .nullable()
      .default(null),

    protocols: z.array(z.string()),
    lineTypes: z.array(z.string()),
    strengths: z.array(z.string()),
    limitations: z.array(z.string()),
    suitableFor: z.array(z.string()),
    notSuitableFor: z.array(z.string()),
    riskLevel: z.enum(['low', 'medium', 'high', 'unknown']),
    dataStatus: z.enum(['verified', 'partial', 'unverified']),
    lastVerified: z.string().nullable(),
    pricingNote: z.string(),
    /** 事实数据行：一律带验证状态，未核验不得写具体数字 */
    facts: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
        /**
         * 来源等级。本站不做统一环境下的独立测速，因此没有「本站实测」这一档。
         * measured 一级：第三方测试工具导出的公开数据（非本站执行）
         * sourced  二级：品牌官方说明与渠道资料，经本站核对
         * pending  该项暂无统一测试数据
         */
        status: z.enum(['measured', 'sourced', 'pending']),
        note: z.string().optional(),
      }),
    ),
    officialUrl: z.string().url().nullable(),
    affiliateUrl: z.string().url().nullable(),
    reviewSlug: z.string().nullable(),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/authors' }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
  }),
});

export const collections = { articles, brands, authors };
