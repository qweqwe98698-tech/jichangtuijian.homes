/**
 * 把品牌图片转成 WebP。测速面板导出图是长表格截图，原始 JPEG 每张 500KB 以上，
 * 15 个品牌页各加载一张，是全站最大的性能负担。
 *
 * 保留原文件不删除（作为原始凭证），只额外产出 .webp 并由组件优先使用。
 * 运行：node scripts/optimize-images.mjs
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, parse } from 'node:path';
import sharp from 'sharp';

const DIR = resolve(process.cwd(), 'public/images/brands');
const kb = (p) => Math.round(statSync(p).size / 1024);

let converted = 0;
let savedKb = 0;

for (const file of readdirSync(DIR)) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const src = join(DIR, file);
  const out = join(DIR, `${parse(file).name}.webp`);

  // 已存在且比源文件新则跳过，避免重复转换
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;

  const before = kb(src);
  await sharp(src)
    // 面板截图是文字密集的长图，quality 太低会糊掉数字；82 是可读性与体积的平衡点
    .webp({ quality: 82, effort: 5 })
    .toFile(out);
  const after = kb(out);
  converted++;
  savedKb += before - after;
  console.log(`${file}  ${before}KB → ${after}KB (${Math.round((1 - after / before) * 100)}% ↓)`);
}

console.log(
  converted
    ? `\n已转换 ${converted} 张，合计减少约 ${savedKb}KB。记得重跑 make-image-manifest.mjs。`
    : '所有图片均已是最新的 WebP，无需转换。',
);
