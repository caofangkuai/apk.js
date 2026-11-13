/**
 * 带 hook 的 APK 渲染器：加载 APK、套用你的 Xposed 风格 hook 脚本、推进若干帧后出图。
 *
 * 用法：
 *   node tools/hook-apk.mjs <apk 路径> <hook 模块> [输出名]
 *
 * hook 模块默认导出 `({ bridge, helpers, vm, engine, log }) => void`，
 * 也可以导出 `hooks` 数组或一个对象（见 docs/api/hooks.md）。
 *
 *   // hooks/rename-title.mjs
 *   export default function ({ bridge, log }) {
 *     bridge.hookAllMethods('android.widget.TextView', 'setText', {
 *       beforeHookedMethod(param) {
 *         if (typeof param.args[0] === 'string') {
 *           log('setText: ' + param.args[0]);
 *           param.args[0] = '[hook] ' + param.args[0];
 *         }
 *       },
 *     });
 *   }
 */
process.on('uncaughtException', (error) => {
  console.log('UNCAUGHT', error?.message);
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { default: Canvas } = await import('canvas');
const { loadApkFiles, EmulatorEngine } = await import('../src/framework/engine.js');
const { XposedRuntime } = await import('../src/runtime/xposed.js');
globalThis.__APKJS_MEASURE_CANVAS = Canvas.createCanvas(8, 8);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkPath = process.argv[2];
const hookPath = process.argv[3];
if (!apkPath || !hookPath) {
  console.error('用法: node tools/hook-apk.mjs <apk 路径> <hook 模块> [输出名]');
  process.exit(1);
}
for (const [label, target] of [['APK', apkPath], ['hook 模块', hookPath]]) {
  if (!fs.existsSync(target)) {
    console.error(`${label} 不存在: ${target}`);
    process.exit(1);
  }
}

const outputName = process.argv[4] || `${path.basename(apkPath).replace(/\.apk$/i, '')}-hooked`;
const width = Number(process.env.RENDER_WIDTH || 720);
const height = Number(process.env.RENDER_HEIGHT || 1520);
const density = Number(process.env.RENDER_DENSITY || 2);
const frames = Number(process.env.HOOK_FRAMES || 90);
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

const xposed = new XposedRuntime(null);
const hookLog = [];
const engine = new EmulatorEngine({
  onLog: () => {},
  width,
  height,
  density,
  nightMode: process.env.RENDER_NIGHT === '1',
  xposed,
});
engine.attachCanvas(canvas);

const record = (text) => {
  hookLog.push(String(text));
  if (hookLog.length <= 40) console.log('[hook] ' + text);
};

// hook 脚本可以导出 default 函数、`hooks` 数组，或 { default, hooks }
const mod = await import(pathToFileURL(path.resolve(hookPath)).href);
const install = mod.default || mod.install || null;
const extras = Array.isArray(mod.hooks) ? mod.hooks : [];
const applyHooks = (bridge, helpers, vm) => {
  if (typeof install === 'function') install({ bridge, helpers, vm, engine, log: record });
  for (const item of extras) {
    if (typeof item === 'function') item({ bridge, helpers, vm, engine, log: record });
  }
};

// 只装一次：此时 VM 还不存在，注册会排队，引擎启动后回放
applyHooks(xposed.bridge, xposed.helpers, null);

const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(apkPath)));
try {
  await engine.start(apk);
} catch (error) {
  console.log('START', error.message);
}

// 目标类可能要等加载更多 dex 才出现，这里再推一次回放
if (engine.vm?.xposed?.pending?.length) engine.vm.xposed.attach(engine.vm);

for (let i = 0; i < frames; i++) {
  if (engine.screen) {
    engine.screen.dirty = true;
    engine.screen.render();
  }
  await new Promise((resolve) => setTimeout(resolve, 16));
}

const outputPath = path.join(outputDir, `${outputName}.png`);
fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
console.log(`已生成 ${path.relative(root, outputPath)}`);

// 顺便把视图树里带 hook 痕迹的文案打出来，确认改写真的生效
const texts = [];
const walk = (view) => {
  if (!view) return;
  if (view.text) texts.push(String(view.text));
  for (const child of view.children || []) walk(child);
  if (view.child) walk(view.child);
};
walk(engine.screen?.decorView);
const rewritten = texts.filter((text) => text.includes('[hook]'));
if (rewritten.length) console.log('改写后的文案', JSON.stringify(rewritten.slice(0, 5)));

console.log(
  '拦截统计',
  JSON.stringify({
    registered: engine.vm?.xposed?.count ?? 0,
    events: hookLog.length,
    pending: engine.vm?.xposed?.pending?.length ?? 0,
  })
);
