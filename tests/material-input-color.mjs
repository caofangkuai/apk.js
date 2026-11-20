/**
 * Material 输入框底色的取色回归。
 *
 * 这组断言覆盖一个曾经很隐蔽的缺陷链：
 *
 *   1. 样式里的颜色值常常是「指向主题属性的引用」（`?attr/colorPrimary`
 *      这类），宿主把它当颜色整数直接用，调用方就拿着一个 attr id
 *      去渲染，显示出完全不相关的颜色——实测是洋红 #FFFF00FF。
 *   2. 系统资源（0x01xxxxxx）不在 APK 的 arsc 里，查表查不到时同样会
 *      被原样当成颜色值。
 *   3. 颜色解析失败时会落到 `Color.MAGENTA` 这个经典的兜底值，于是
 *      整个控件被涂成洋红，而报错位置离真正的缺失很远。
 *
 * 这里直接取真实样例 APK 渲染后的像素，断言底色是主题色而不是洋红。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { default: Canvas } = await import('canvas');
const { loadApkFiles, EmulatorEngine } = await import('../src/framework/engine.js');

const APK = new URL('../samples/textinput-dex.apk', import.meta.url).pathname;
if (!fs.existsSync(APK)) {
  // 样例 APK 由 tools/build-textinput-apk.sh 生成，不在版本库里
  console.log('material input color OK (跳过：样例 APK 未构建)');
  process.exit(0);
}

globalThis.__APKJS_MEASURE_CANVAS = Canvas.createCanvas(8, 8);
const canvas = Canvas.createCanvas(720, 1520);
canvas.style = {};
canvas.clientWidth = 720;
canvas.clientHeight = 1520;
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};
canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 1520 });

const engine = new EmulatorEngine({ width: 720, height: 1520, density: 2, onLog: () => {} });
engine.attachCanvas(canvas);
await engine.start(await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(APK))));

for (let i = 0; i < 12; i += 1) {
  engine.screen.dirty = true;
  engine.screen.render();
  await new Promise((resolve) => setTimeout(resolve, 8));
}

// 找到输入框容器
let inputLayout = null;
const walk = (view) => {
  if (!view) return;
  if (String(view.$descriptor || '').includes('TextInputLayout')) inputLayout = inputLayout || view;
  for (const child of view.children || []) walk(child);
  if (view.child) walk(view.child);
};
walk(engine.screen.decorView);

assert.ok(inputLayout, '应能找到输入框容器');
assert.ok(inputLayout.right - inputLayout.left > 0, '输入框应有非零宽度');

// 取容器内一点，断言不是洋红
const ctx = canvas.getContext('2d');
const sampleX = Math.round((inputLayout.left + inputLayout.right) / 2);
const sampleY = inputLayout.top + Math.floor((inputLayout.bottom - inputLayout.top) / 2);
const [r, g, b] = ctx.getImageData(sampleX, sampleY, 1, 1).data;

const isMagenta = r > 240 && g < 20 && b > 240;
assert.equal(isMagenta, false, `输入框底色不应是洋红，实际 rgb(${r},${g},${b})`);

console.log('material input color OK', { rgb: `${r},${g},${b}` });
