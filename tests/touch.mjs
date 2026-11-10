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
const tap = async (x, y) => {
  engine.screen.dispatchTouch({ action: 'down', x, y, rawX: x, rawY: y });
  await wait(80);
  engine.screen.dispatchTouch({ action: 'up', x, y, rawX: x, rawY: y });
  await pump(500);
};
const text = () => {
  const values = [];
  const walk = (view) => {
    if (!view) return;
    if (view.text) values.push(String(view.text));
    for (const child of view.children || []) walk(child);
    if (view.child) walk(view.child);
  };
  walk(engine.screen.decorView);
  return values.join('|');
};

const findButton = (needle) => {
  let found = null;
  const walk = (view) => {
    if (!view) return;
    const text = String(view.text || '');
    if (text.includes(needle) && (!found || view.clickable)) found = view;
    for (const child of view.children || []) walk(child);
    if (view.child) walk(view.child);
  };
  walk(engine.screen.decorView);
  return found;
};
const tapButton = async (needle) => {
  const view = findButton(needle);
  assert.ok(view, `找不到按钮: ${needle}`);
  const x = (view.left + view.right) / 2;
  const y = (view.top + view.bottom) / 2;
  await tap(x, y);
};
await pump(400);
await tapButton('点我执行 DEX 逻辑');
assert.ok(text().includes('已点击 1 次'), '触摸未触发点击回调');
await tap(324, 1267);
assert.ok(text().includes('10%'), '触摸未更新进度');
console.log('touch OK');
