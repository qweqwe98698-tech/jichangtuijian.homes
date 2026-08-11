/** JSON-LD 构造函数。原则：页面上没有对应可见内容的 Schema 一律不输出。 */
import { SITE } from './site';

type Json = Record<string, unknown>;

export function organizationSchema(): Json {
  return {
    '@type': 'Organization',
    '@id': `${SITE.url}/#org`,
    name: SITE.name,
    url: `${SITE.url}/`,
    description: SITE.description,
  };
}

export function webSiteSchema(): Json {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    url: `${SITE.url}/`,
    inLanguage: SITE.locale,
    publisher: { '@id': `${SITE.url}/#org` },
    // 站内搜索由 Pagefind 在浏览器本地完成，query 参数由搜索页读取
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE.url}/search/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * 页面类型 Schema。只在页面确有对应语义时使用——
 * AboutPage 用于关于页，ContactPage 用于联系页，其余用 WebPage。
 */
export function webPageSchema(opts: {
  type?: 'WebPage' | 'AboutPage' | 'ContactPage' | 'CollectionPage';
  name: string;
  description: string;
  path: string;
}): Json {
  return {
    '@type': opts.type ?? 'WebPage',
    '@id': `${SITE.url}${opts.path}#webpage`,
    url: `${SITE.url}${opts.path}`,
    name: opts.name,
    description: opts.description,
    inLanguage: SITE.locale,
    isPartOf: { '@id': `${SITE.url}/#website` },
    publisher: { '@id': `${SITE.url}/#org` },
  };
}

export interface Crumb {
  name: string;
  href: string;
}

export function breadcrumbSchema(crumbs: Crumb[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${SITE.url}${c.href}`,
    })),
  };
}

export function articleSchema(opts: {
  title: string;
  description: string;
  path: string;
  pubDate: Date;
  updatedDate?: Date;
  authorName: string;
}): Json {
  return {
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    inLanguage: SITE.locale,
    mainEntityOfPage: `${SITE.url}${opts.path}`,
    datePublished: opts.pubDate.toISOString(),
    dateModified: (opts.updatedDate ?? opts.pubDate).toISOString(),
    author: {
      '@type': 'Organization',
      name: opts.authorName,
      url: `${SITE.url}/authors/editorial/`,
    },
    publisher: { '@id': `${SITE.url}/#org` },
  };
}

export function faqSchema(faq: { q: string; a: string }[]): Json {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function howToSchema(opts: { name: string; description: string; steps: string[] }): Json {
  return {
    '@type': 'HowTo',
    name: opts.name,
    description: opts.description,
    step: opts.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s })),
  };
}

/** 包装为 @graph 输出 */
export function jsonLd(items: Json[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': items });
}
