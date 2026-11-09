import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('用法: node tools/render-batch.mjs <apk 目录>');
  process.exit(2);
}
const dir = path.resolve(input);
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error('目录不存在:', dir);
  process.exit(2);
}
const files = fs.readdirSync(dir).filter((name) => /\.apk$/i.test(name)).sort();
if (!files.length) {
  console.log('没有找到 APK');
  process.exit(0);
}
let failed = 0;
for (const file of files) {
  const name = path.basename(file, path.extname(file)).replace(/[^\w.-]+/g, '_');
  const result = spawnSync(process.execPath, [path.join(root, 'tools/render-apk.mjs'), path.join(dir, file), name], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
console.log(`批量渲染完成: ${files.length - failed}/${files.length}`);
process.exit(failed ? 1 : 0);
