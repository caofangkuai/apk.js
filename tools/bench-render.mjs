import fs from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { createCanvas } = require('canvas');
const { loadApkFiles, EmulatorEngine } = await import('../src/framework/engine.js');

const apkPath = process.argv[2] || process.env.APK_PATH || '/tmp/devinfo.apk';
const frames = Number(process.env.BENCH_FRAMES || 120);
if (!fs.existsSync(apkPath)) {
  console.error('APK 不存在:', apkPath);
  process.exit(1);
}
globalThis.__APKJS_MEASURE_CANVAS = createCanvas(8, 8);
const width = 360;
const height = 640;
const canvas = createCanvas(width, height);
canvas.style = {};
canvas.clientWidth = width;
canvas.clientHeight = height;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
const engine = new EmulatorEngine({ onLog: () => {}, width, height, density: 1 });
engine.attachCanvas(canvas);
const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath)));
await engine.start(apk);
const screen = engine.screen;
await new Promise((resolve) => setTimeout(resolve, 800));
const samples = [];
for (let i = 0; i < frames; i++) {
  screen.dirty = true;
  const start = performance.now();
  screen.render();
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const sum = samples.reduce((total, value) => total + value, 0);
const result = {
  frames,
  avgMs: Number((sum / frames).toFixed(3)),
  p50Ms: Number(samples[Math.floor(frames * 0.5)].toFixed(3)),
  p95Ms: Number(samples[Math.floor(frames * 0.95)].toFixed(3)),
  maxMs: Number(samples[frames - 1].toFixed(3)),
  fps: Number((1000 / (sum / frames)).toFixed(1)),
};
console.log(JSON.stringify(result));
