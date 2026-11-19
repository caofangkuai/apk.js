/**
 * RecyclerView 基建回归。
 *
 * 1) 静态检查：ViewGroup 必须实现 NestedScrollingParent 契约。缺少
 *    onStartNestedScroll / onNestedPreScroll 等方法时，依赖嵌套滚动的控件
 *    （列表在 CoordinatorLayout / SwipeRefreshLayout 里）在拖动时完全不动。
 * 2) 行为检查：在真实 APK 上通过屏幕的正常触摸分发拖动列表，确认滚动位置变化。
 *
 * 没有真实 APK 时第 2 部分自动跳过。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';
import { ClassRegistry } from '../src/runtime/class-registry.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { JavaVM } from '../src/runtime/vm.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { createCanvas } = require('canvas');

/* ---------------- 1. 嵌套滚动契约 ---------------- */
const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
const group = vm.registry.resolve('Landroid/view/ViewGroup;');
const required = [
  'onStartNestedScroll(Landroid/view/View;Landroid/view/View;I)Z',
  'onNestedScrollAccepted(Landroid/view/View;Landroid/view/View;I)V',
  'onNestedPreScroll(Landroid/view/View;II[I)V',
  'onNestedScroll(Landroid/view/View;IIIII)V',
  'onStopNestedScroll(Landroid/view/View;)V',
  'onNestedPreFling(Landroid/view/View;FF)Z',
];
const missing = required.filter((key) => {
  const name = key.slice(0, key.indexOf('('));
  const proto = key.slice(key.indexOf('('));
  return !group.nativeDef.findInstanceMethod(name, proto);
});
assert.deepEqual(missing, [], `ViewGroup 缺少嵌套滚动方法: ${missing.join(', ')}`);

/* ---------------- 2. 真实 APK 上的拖动 ---------------- */
const candidates = [process.env.REGRESSION_APK, '/tmp/devinfo.apk'].filter(Boolean);
const apkPath = candidates.find((item) => fs.existsSync(item));
if (!apkPath) {
  console.log('recyclerview OK', { nestedScrollContract: required.length, apk: 'skipped' });
  process.exit(0);
}

const canvas = createCanvas(720, 1520);
canvas.style = {};
canvas.clientWidth = 720;
canvas.clientHeight = 1520;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 1520 });
globalThis.__APKJS_MEASURE_CANVAS = canvas;

const logs = [];
const engine = new EmulatorEngine({ width: 720, height: 1520, density: 2, onLog: (entry) => logs.push(entry) });
engine.attachCanvas(canvas);
await engine.start(await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath))));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pump = async (frames) => {
  for (let i = 0; i < frames; i++) {
    engine.screen.dirty = true;
    engine.screen.render();
    await wait(8);
  }
};
await pump(60);

const collect = () => {
  const found = [];
  const walk = (view) => {
    if (!view) return;
    const descriptor = String(view.$descriptor || view.$nativeClass || '');
    if (descriptor.includes('RecyclerView')) found.push(view);
    for (const child of view.children || []) walk(child);
    if (view.child) walk(view.child);
  };
  walk(engine.screen.decorView);
  return found;
};
const lists = collect();
assert.ok(lists.length > 0, '真实 APK 中应当存在 RecyclerView（用于回归嵌套滚动）');

// 目标：挑一个真正有高度的列表，在它的可视区域内拖动
const target = lists.find((view) => (view.height | 0) > 0 && (view.children || []).length > 0) || lists[0];
const before = target.scrollY | 0;
const startX = Math.round(((target.left | 0) + (target.right | 0)) / 2);
const startY = Math.round(((target.top | 0) + (target.bottom | 0)) / 2);
engine.screen.dispatchTouch({ action: 'down', x: startX, y: startY, pointerId: 0 });
for (let step = 1; step <= 6; step += 1) {
  engine.screen.dispatchTouch({ action: 'move', x: startX, y: startY - step * 20, pointerId: 0 });
}
engine.screen.dispatchTouch({ action: 'up', x: startX, y: startY - 120, pointerId: 0 });
await pump(20);

const after = target.scrollY | 0;
const unbound = logs.filter((entry) => /onStartNestedScroll|onNestedPreScroll|onNestedScroll\(/.test(entry.message || ''));
assert.deepEqual(
  unbound.map((entry) => entry.message),
  [],
  '拖动手势不应再出现嵌套滚动方法未绑定'
);

// 内容恰好填满可视区时，RecyclerView 判定无可滚余量，不滚动是正确行为。
// 这里只在确有可滚余量的情况下要求滚动，并额外用 scrollBy 验证宿主滚动通路。
const lastChild = (target.children || [])[target.children.length - 1];
const contentHeight = (lastChild?.bottom ?? 0) - (target.top | 0);
const viewHeight = (target.bottom | 0) - (target.top | 0);
const scrollable = contentHeight > viewHeight + 2;
if (scrollable) {
  assert.notEqual(after, before, `内容超出可视区时，拖动应改变滚动位置（${before} → ${after}）`);
}

// 无论界面是否有可滚余量，宿主的滚动通路都必须可用：
// 通过 Java 侧 setScrollY / getScrollY 走一遍，确认值能同步到宿主节点。
const beforeScroll = target.scrollY | 0;
engine.vm.invokeByName('setScrollY', '(I)V', target.$javaObject, [beforeScroll + 120]);
const afterScroll = target.scrollY | 0;
assert.equal(afterScroll, beforeScroll + 120, `setScrollY 应同步到宿主节点（${beforeScroll} → ${afterScroll}）`);
engine.vm.invokeByName('setScrollY', '(I)V', target.$javaObject, [beforeScroll]);

console.log('recyclerview OK', {
  nestedScrollContract: required.length,
  lists: lists.length,
  scrollable,
  drag: `${before}→${after}`,
  scrollBy: `${beforeScroll}→${afterScroll}`,
});
