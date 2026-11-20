#!/usr/bin/env node
/**
 * 真实 APK 冒烟：自动点开可点击的标签页，逐页出图并收集未绑定方法与异常。
 *
 * 用法：
 *   node tools/apk-smoke.mjs <apk 路径> [--out=前缀] [--tabs=常规,芯片] [--settle=1200]
 *
 * 输出：
 *   image-debug/<前缀>-<序号>-<标签>.png
 *   控制台打印每页的未绑定方法（去重）与异常。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { createCanvas } = require('canvas');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkPath = process.argv[2];
if (!apkPath || !fs.existsSync(apkPath)) {
  console.error('用法: node tools/apk-smoke.mjs <apk 路径> [--out=前缀] [--tabs=a,b] [--settle=1200]');
  process.exit(1);
}
const options = { out: path.basename(apkPath).replace(/\.apk$/i, ''), tabs: null, settle: 1200 };
for (const arg of process.argv.slice(3)) {
  if (arg.startsWith('--out=')) options.out = arg.slice(6);
  else if (arg.startsWith('--tabs=')) options.tabs = arg.slice(7).split(',').map((item) => item.trim()).filter(Boolean);
  else if (arg.startsWith('--settle=')) options.settle = Number(arg.slice(9)) || 1200;
}

const width = Number(process.env.RENDER_WIDTH || 720);
const height = Number(process.env.RENDER_HEIGHT || 1520);
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
const engine = new EmulatorEngine({
  width,
  height,
  density: 2,
  nightMode: process.env.RENDER_NIGHT === '1',
  onLog: (level, tag, message) => logs.push(`${level}/${tag} ${message}`),
});
engine.attachCanvas(canvas);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pump = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    engine.screen.dirty = true;
    engine.screen.render();
    await wait(16);
  }
};

function walk(view, visit, depth = 0) {
  if (!view || depth > 20) return;
  visit(view);
  for (const child of view.children || []) walk(child, visit, depth + 1);
  if (view.child) walk(view.child, visit, depth + 1);
}

function collectTabs() {
  const tabs = [];
  const seen = new Set();
  walk(engine.screen.decorView, (view) => {
    if (!view.clickable) return;
    const label = String(view.contentDescription || view.text || '').trim();
    if (!label || seen.has(label)) return;
    // 抽屉/返回按钮会把界面遮挡住，不作为标签页点击。
    if (/navigation drawer|^back$|^menu$/i.test(label)) return;
    if (view.right - view.left < 24 || view.bottom - view.top < 24) return;
    seen.add(label);
    tabs.push({ label, view });
  });
  return tabs;
}

function findTab(label) {
  let found = null;
  walk(engine.screen.decorView, (view) => {
    if (found || !view.clickable) return;
    const text = String(view.contentDescription || view.text || '').trim();
    if (text === label) found = view;
  });
  return found;
}

function unboundSince(index) {
  const set = new Set();
  for (const line of logs.slice(index)) {
    const match = /未绑定方法，返回默认值: (.+)$/.exec(line);
    if (match) set.add(match[1]);
  }
  return [...set];
}

function errorsSince(index) {
  return logs.slice(index).filter((line) => /Exception|Error|Cannot|missing|未实现|unsupported/i.test(line));
}

async function capture(name) {
  engine.screen.dirty = true;
  engine.screen.render();
  const file = path.join(root, 'image-debug', `${options.out}-${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return path.relative(root, file);
}

await engine.start(await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath))));
await pump(options.settle);

const discovered = collectTabs();
const labels = options.tabs || discovered.map((tab) => tab.label);
console.log(`APK: ${path.basename(apkPath)}  可点击项: ${labels.join(' / ') || '(无)'}`);

const report = [];
let index = 0;
for (const label of labels) {
  const start = logs.length;
  const view = findTab(label);
  if (!view) {
    console.log(`- ${label}: 视图树中找不到可点击项，跳过`);
    continue;
  }
  const clicked = view.performClick?.() ?? false;
  await pump(options.settle);
  const file = await capture(`${String(index).padStart(2, '0')}-${label.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}`);
  index++;
  const unbound = unboundSince(start);
  const errors = errorsSince(start);
  report.push({ label, clicked, file, unbound, errors });
  console.log(`- ${label}: clicked=${clicked} 未绑定=${unbound.length} 异常=${errors.length} -> ${file}`);
  for (const signature of unbound.slice(0, 12)) console.log(`    未绑定 ${signature}`);
  for (const error of errors.slice(0, 4)) console.log(`    异常 ${error.slice(0, 160)}`);
}

const summary = new Map();
for (const item of report) for (const signature of item.unbound) summary.set(signature, (summary.get(signature) || 0) + 1);
if (summary.size) {
  console.log('\n跨页面未绑定方法:');
  for (const [signature, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x ${signature}`);
  }
}
const crashed = report.filter((item) => item.errors.length);
if (crashed.length) {
  console.log(`\n存在异常的页面: ${crashed.map((item) => item.label).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\n冒烟通过: 所有页面均无未捕获异常');
}
