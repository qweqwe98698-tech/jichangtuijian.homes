/** 生成默认 OG 图（1200x630）。运行：node scripts/make-og.mjs */
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#f7f4ee"/>
  <rect x="48" y="48" width="1104" height="534" fill="none" stroke="#20614b" stroke-width="6"/>
  <rect x="48" y="48" width="14" height="534" fill="#20614b"/>
  <text x="120" y="270" font-family="'Noto Serif SC','Microsoft YaHei',SimSun,serif" font-size="96" font-weight="600" fill="#211d16">机场决策室</text>
  <text x="120" y="370" font-family="'Noto Serif SC','Microsoft YaHei',SimSun,serif" font-size="44" fill="#20614b">先讲标准，再谈推荐</text>
  <text x="120" y="500" font-family="Georgia,serif" font-size="30" fill="#6b6353">jichangtuijian.homes</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile('public/og-default.png');
console.log('public/og-default.png 已生成');
