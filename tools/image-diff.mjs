import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('canvas');

const [baselinePath, candidatePath, diffPathArg] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error('用法: node tools/image-diff.mjs <baseline.png> <candidate.png> [diff.png]');
  process.exit(2);
}
const baseline = await loadImage(fs.readFileSync(baselinePath));
const candidate = await loadImage(fs.readFileSync(candidatePath));
if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
  console.error('尺寸不一致', baseline.width + 'x' + baseline.height, candidate.width + 'x' + candidate.height);
  process.exit(1);
}
const a = createCanvas(baseline.width, baseline.height);
const b = createCanvas(candidate.width, candidate.height);
a.getContext('2d').drawImage(baseline, 0, 0);
b.getContext('2d').drawImage(candidate, 0, 0);
const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
const db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
const diff = createCanvas(a.width, a.height);
const dc = diff.getContext('2d');
const out = dc.createImageData(a.width, a.height);
let changed = 0;
let totalDelta = 0;
for (let i = 0; i < da.length; i += 4) {
  const delta = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) + Math.abs(da[i + 3] - db[i + 3]);
  totalDelta += delta;
  if (delta > 12) {
    changed++;
    out.data[i] = 255;
    out.data[i + 1] = 0;
    out.data[i + 2] = 0;
    out.data[i + 3] = 255;
  } else {
    const gray = Math.round((da[i] + da[i + 1] + da[i + 2]) / 3 * 0.25 + 200 * 0.75);
    out.data[i] = gray;
    out.data[i + 1] = gray;
    out.data[i + 2] = gray;
    out.data[i + 3] = 255;
  }
}
dc.putImageData(out, 0, 0);
const diffPath = diffPathArg || path.join(path.dirname(candidatePath), path.basename(candidatePath, path.extname(candidatePath)) + '.diff.png');
fs.writeFileSync(diffPath, diff.toBuffer('image/png'));
const pixels = a.width * a.height;
const ratio = changed / pixels;
console.log(JSON.stringify({ width: a.width, height: a.height, changed, pixels, ratio: Number(ratio.toFixed(6)), meanDelta: Number((totalDelta / pixels).toFixed(3)), diff: diffPath }));
process.exit(ratio > 0.01 ? 1 : 0);
