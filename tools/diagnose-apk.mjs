import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { createCanvas } = require('canvas');
const apkPath = process.argv[2];
if (!apkPath || !fs.existsSync(apkPath)) {
  console.error('用法: node tools/diagnose-apk.mjs <apk> [宽] [高]');
  process.exit(1);
}
const width = Number(process.argv[3]) || 720;
const height = Number(process.argv[4]) || 1520;
const canvas = createCanvas(width, height);
canvas.style = {};
canvas.clientWidth = width;
canvas.clientHeight = height;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
globalThis.__APKJS_MEASURE_CANVAS = canvas;

const logs = [];
const engine = new EmulatorEngine({ width, height, density: 2, onLog: (line) => logs.push(String(line.message || line)) });
engine.attachCanvas(canvas);
await engine.start(await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath))));
await new Promise((resolve) => setTimeout(resolve, 1500));

const interesting = logs.filter((line) => /未实现|missing|not bound|Cannot|Error|Exception|unimplemented|unsupported/i.test(line));
const counts = new Map();
for (const line of interesting) counts.set(line, (counts.get(line) || 0) + 1);
for (const [line, count] of counts) console.log(`${count}x ${line}`);
console.log(`logs=${logs.length} interesting=${interesting.length}`);
