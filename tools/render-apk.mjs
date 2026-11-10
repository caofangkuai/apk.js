process.on('uncaughtException', (error) => {
  console.log('UNCAUGHT', error?.message);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { default: Canvas } = await import('canvas');
const { loadApkFiles, EmulatorEngine } = await import('../src/framework/engine.js');
globalThis.__APKJS_MEASURE_CANVAS = Canvas.createCanvas(8, 8);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkPath = process.argv[2];
if (!apkPath) {
  console.error('用法: node tools/render-apk.mjs <apk 路径> [输出名]');
  process.exit(1);
}
if (!fs.existsSync(apkPath)) {
  console.error('APK 不存在: ' + apkPath);
  process.exit(1);
}
const outputName = process.argv[3] || path.basename(apkPath).replace(/\.apk$/i, '');
const width = Number(process.env.RENDER_WIDTH || 720);
const height = Number(process.env.RENDER_HEIGHT || 1520);
const density = Number(process.env.RENDER_DENSITY || 2);

const outputDir = path.join(root, 'image-debug');
fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync('/etc/fonts/fonts.conf') && !fs.existsSync('/usr/share/fonts/opentype/noto-cjk')) {
  console.warn('提示: 未找到 CJK 字体，渲染可能出现豆腐块；可运行 npm run setup:fonts');
}
const canvas = Canvas.createCanvas(width, height);
canvas.style = {};
canvas.clientWidth = width;
canvas.clientHeight = height;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });

const engine = new EmulatorEngine({ onLog: () => {}, width, height, density, nightMode: process.env.RENDER_NIGHT === '1' });
engine.attachCanvas(canvas);

const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath)));
try {
  await engine.start(apk);
} catch (error) {
  console.log('START', error.message);
}
await new Promise((resolve) => setTimeout(resolve, 1500));

const screen = engine.screen;
if (screen?.decorView) {
  screen.dirty = true;
  screen.render();
}

const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
let blankSamples = 0;
const totalSamples = canvas.width * canvas.height;
for (let i = 0; i < imageData.length; i += 4) {
  if (imageData[i] > 245 && imageData[i + 1] > 245 && imageData[i + 2] > 245) blankSamples++;
}
if (blankSamples / totalSamples > 0.995) {
  console.log('WARN 画面接近空白，检查 Activity 启动或渲染链路');
}

const outputPath = path.join(outputDir, `${outputName}.png`);
fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
console.log(`已生成 ${path.relative(root, outputPath)}`);
