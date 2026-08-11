/**
 * 生成 public/images/brands 下所有图片的真实尺寸清单，供 <img width/height> 使用，避免 CLS。
 * 运行：node scripts/make-image-manifest.mjs（新增或替换品牌图后需重跑）
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const DIR = resolve(process.cwd(), 'public/images/brands');
const OUT = resolve(process.cwd(), 'src/lib/image-manifest.json');

const manifest = {};
const files = readdirSync(DIR);
for (const f of files) {
  if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
  const { width, height } = await sharp(resolve(DIR, f)).metadata();
  const entry = { width, height };
  // 若存在同名 WebP，记录下来供组件优先使用（体积通常只有原图的 30–50%）
  const webp = f.replace(/\.(png|jpe?g)$/i, '.webp');
  if (webp !== f && files.includes(webp)) entry.webp = `/images/brands/${webp}`;
  manifest[`/images/brands/${f}`] = entry;
}

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`已写入 ${Object.keys(manifest).length} 张图片尺寸 → src/lib/image-manifest.json`);
