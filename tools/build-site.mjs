import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDist = path.join(root, 'docs', '.vitepress', 'dist');
const siteDir = path.join(root, 'site');

console.log('[site] 构建 VitePress 文档…');
execSync('npx vitepress build docs', { cwd: root, stdio: 'inherit' });

if (!fs.existsSync(docsDist)) {
  throw new Error('未找到 VitePress 构建产物');
}

console.log('[site] 复制文档产物到 site/…');
fs.rmSync(siteDir, { recursive: true, force: true });
fs.mkdirSync(siteDir, { recursive: true });
fs.cpSync(docsDist, siteDir, { recursive: true });

const copies = [
  ['playground.html', 'playground.html'],
  ['dist/apk.min.js', 'dist/apk.min.js'],
  ['dist/android-framework.min.js', 'dist/android-framework.min.js'],
  ['vendor/jszip.min.js', 'vendor/jszip.min.js'],
  ['samples/hello-dex.apk', 'samples/hello-dex.apk'],
];

for (const [from, to] of copies) {
  const source = path.join(root, from);
  const target = path.join(siteDir, to);
  if (!fs.existsSync(source)) {
    console.warn(`[site] 跳过缺失文件：${from}`);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log('[site] 完成，产物位于 site/');
