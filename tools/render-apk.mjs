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
const outputName = process.argv[3] || path.basename(apkPath).replace(/\.apk$/i, '');
const width = Number(process.env.RENDER_WIDTH || 720);
const height = Number(process.env.RENDER_HEIGHT || 1520);
const density = Number(process.env.RENDER_DENSITY || 2);

const outputDir = path.join(root, 'image-debug');
fs.mkdirSync(outputDir, { recursive: true });

const canvas = Canvas.createCanvas(width, height);
canvas.style = {};
canvas.clientWidth = width;
canvas.clientHeight = height;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });

const engine = new EmulatorEngine({ onLog: () => {}, width, height, density });
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

const outputPath = path.join(outputDir, `${outputName}.png`);
fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
console.log(`已生成 ${path.relative(root, outputPath)}`);
