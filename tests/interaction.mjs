import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { createCanvas } = require('canvas');

const canvas = createCanvas(720, 1520);
canvas.style = {};
canvas.clientWidth = 720;
canvas.clientHeight = 1520;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 1520 });
globalThis.__APKJS_MEASURE_CANVAS = canvas;

const engine = new EmulatorEngine({ width: 720, height: 1520, density: 2, onLog() {} });
engine.attachCanvas(canvas);
await engine.start(await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('samples/hello-dex.apk'))));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pump = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    engine.screen.dirty = true;
    engine.screen.render();
    await wait(16);
  }
};
const findText = (needle) => {
  let found = null;
  const walk = (view) => {
    if (!view) return;
    if (String(view.text || '').includes(needle)) found = view;
    for (const child of view.children || []) walk(child);
    if (view.child) walk(view.child);
  };
  walk(engine.screen.decorView);
  return found;
};
const tapText = async (needle) => {
  const view = findText(needle);
  assert.ok(view, `找不到按钮: ${needle}`);
  assert.ok(view.performClick?.(), `按钮不可点击: ${needle}`);
  await pump(600);
};

await pump(400);
await tapText('点我执行 DEX 逻辑');
assert.ok(findText('已点击 1 次'), '点击计数未更新');
await tapText('推进进度 +10');
assert.ok(findText('10%'), '进度未更新');
await tapText('动态添加一行');
assert.ok(findText('动态行 #1'), '动态行未添加');
console.log('interaction OK');
