/**
 * APK 调用热点剖析：加载 APK、推进固定帧数，统计每个方法的调用次数与包含子调用的耗时。
 *
 * 用法：
 *   node tools/profile-apk.mjs <apk 路径> [topN]
 *
 * 环境变量：PROFILE_FRAMES（默认 120）、RENDER_WIDTH / RENDER_HEIGHT / RENDER_DENSITY。
 *
 * 统计口径是「inclusive time」：方法自身的耗时加上它内部所有调用的耗时，
 * 所以排在前面的通常是 onDraw / layout 这类入口方法；要判断单点开销，
 * 看「占比」和「次数」一起更准（次数高、占比也高才是真热点）。
 */
process.on('uncaughtException', (error) => {
  console.log('UNCAUGHT', error?.message);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { default: Canvas } = await import('canvas');
const { loadApkFiles, EmulatorEngine } = await import('../src/framework/engine.js');
globalThis.__APKJS_MEASURE_CANVAS = Canvas.createCanvas(8, 8);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkPath = process.argv[2];
if (!apkPath) {
  console.error('用法: node tools/profile-apk.mjs <apk 路径> [topN]');
  process.exit(1);
}
if (!fs.existsSync(apkPath)) {
  console.error('APK 不存在: ' + apkPath);
  process.exit(1);
}
const topN = Math.max(1, Number(process.argv[3]) || 25);
const frames = Number(process.env.PROFILE_FRAMES || 120);
const width = Number(process.env.RENDER_WIDTH || 720);
const height = Number(process.env.RENDER_HEIGHT || 1520);
const density = Number(process.env.RENDER_DENSITY || 2);

const canvas = Canvas.createCanvas(width, height);
canvas.style = {};
canvas.clientWidth = width;
canvas.clientHeight = height;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });

/** DEX + 宿主方法合计 */
/** @type {Map<string, { count: number, ms: number }>} */
const stats = new Map();
let totalCalls = 0;
let totalMs = 0;

/** 仅宿主 native 实现 */
/** @type {Map<string, { count: number, ms: number }>} */
const nativeStats = new Map();
let nativeTotalCalls = 0;
let nativeTotalMs = 0;

/** 把 vm.invoke 换成带计时的版本；重复调用无副作用。 */
const wrap = (vm) => {
  if (!vm || vm.__profiled) return vm;
  vm.__profiled = true;
  const nativeInvoke = vm.invoke.bind(vm);
  vm.invoke = function profiledInvoke(ref, receiver, args, mode, currentMethod) {
    const key = `${ref?.classDesc || '?'}.${ref?.name || '?'}${ref?.proto?.descriptor || ''}`;
    const startedAt = performance.now();
    try {
      return nativeInvoke(ref, receiver, args, mode, currentMethod);
    } finally {
      const elapsed = performance.now() - startedAt;
      totalCalls += 1;
      totalMs += elapsed;
      const entry = stats.get(key);
      if (entry) {
        entry.count += 1;
        entry.ms += elapsed;
      } else {
        stats.set(key, { count: 1, ms: elapsed });
      }
    }
  };

  // 只统计宿主实现（android.* / java.* 的 native 方法）
  const originalInvokeNative = vm.invokeNative.bind(vm);
  vm.invokeNative = function profiledInvokeNative(resolution, receiver, args, ref, mode) {
    const key = `${resolution?.def?.descriptor || '?'}.${ref?.name || '?'}${ref?.proto?.descriptor || ''}`;
    const startedAt = performance.now();
    try {
      return originalInvokeNative(resolution, receiver, args, ref, mode);
    } finally {
      const elapsed = performance.now() - startedAt;
      nativeTotalCalls += 1;
      nativeTotalMs += elapsed;
      const entry = nativeStats.get(key);
      if (entry) {
        entry.count += 1;
        entry.ms += elapsed;
      } else {
        nativeStats.set(key, { count: 1, ms: elapsed });
      }
    }
  };
  return vm;
};

// 在 VM 刚创建时就开始计时，这样 Activity 启动的调用也会算进去
const engine = new EmulatorEngine({
  onLog: () => {},
  width,
  height,
  density,
  hooks: { 'start:after': (payload) => { if (payload?.vm) { wrap(payload.vm); } } },
});
engine.attachCanvas(canvas);
const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath)));
try {
  await engine.start(apk);
} catch (error) {
  console.log('START', error.message);
}

const vm = wrap(engine.vm);
if (!vm) {
  console.error('VM 未创建，无法统计');
  process.exit(1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frameMs = [];
for (let i = 0; i < frames; i++) {
  const startedAt = performance.now();
  if (engine.screen) {
    engine.screen.dirty = true;
    engine.screen.render();
  }
  frameMs.push(performance.now() - startedAt);
  await wait(0);
}

const sorted = [...stats.entries()]
  .map(([key, value]) => ({ key, count: value.count, ms: value.ms }))
  .sort((a, b) => b.ms - a.ms);

const fmt = (value) => value.toFixed(2);
const shownPath = apkPath.startsWith(root + path.sep) ? path.relative(root, apkPath) : apkPath;
console.log(`APK: ${shownPath}`);
console.log(`帧数: ${frames}  invoke 总数: ${totalCalls}  累计耗时: ${fmt(totalMs)}ms`);
const avgFrame = frameMs.reduce((sum, value) => sum + value, 0) / Math.max(1, frameMs.length);
const sortedFrames = [...frameMs].sort((a, b) => a - b);
console.log(
  `单帧渲染: avg ${fmt(avgFrame)}ms  p50 ${fmt(sortedFrames[Math.floor(sortedFrames.length * 0.5)])}ms  max ${fmt(sortedFrames[sortedFrames.length - 1] || 0)}ms`
);
console.log('');
console.log('#  占比    次数      平均(ms)  方法');
sorted.slice(0, topN).forEach((item, index) => {
  const share = ((item.ms / Math.max(totalMs, 0.0001)) * 100).toFixed(1);
  const avg = (item.ms / item.count).toFixed(3);
  console.log(
    `${String(index + 1).padStart(2)} ${share.padStart(5)}%  ${String(item.count).padStart(8)}  ${avg.padStart(9)}  ${item.key}`
  );
});
console.log('');
const nativeSorted = [...nativeStats.entries()]
  .map(([key, value]) => ({ key, count: value.count, ms: value.ms }))
  .sort((a, b) => b.ms - a.ms);

console.log(`宿主 native 调用: ${nativeTotalCalls} 次  累计 ${fmt(nativeTotalMs)}ms`);
console.log('#  占比    次数      平均(ms)  宿主方法');
nativeSorted.slice(0, topN).forEach((item, index) => {
  const share = ((item.ms / Math.max(nativeTotalMs, 0.0001)) * 100).toFixed(1);
  const avg = (item.ms / item.count).toFixed(3);
  console.log(
    `${String(index + 1).padStart(2)} ${share.padStart(5)}%  ${String(item.count).padStart(8)}  ${avg.padStart(9)}  ${item.key}`
  );
});

console.log(`统计的方法数: ${stats.size}（其中宿主方法 ${nativeStats.size}）`);
