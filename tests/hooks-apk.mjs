/**
 * Xposed 拦截层对真实 APK 的端到端验证：用仓库里的 samples/hello-dex.apk，
 * 在 onCreate 期间拦截 TextView.setText，确认能读到参数、能改写、能在 after 阶段观察。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';
import { XposedRuntime } from '../src/runtime/xposed.js';

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

const texts = [];
let afterCalls = 0;
const xposed = new XposedRuntime(null);
xposed.bridge.hookAllMethods('android.widget.TextView', 'setText', {
  beforeHookedMethod(param) {
    const value = param.args[0];
    if (typeof value !== 'string') return;
    texts.push(value);
    // 改写参数必须发生在 before 阶段：原方法执行时才会读到新值
    if (value === 'Hello World') param.args[0] = 'Hooked Hello World';
  },
  afterHookedMethod(param) {
    afterCalls += 1;
  },
});

const engine = new EmulatorEngine({ width: 720, height: 1520, density: 2, onLog() {}, xposed });
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
await pump(120);

assert.ok(texts.length > 0, 'TextView.setText 应当被拦截到');
assert.ok(afterCalls > 0, 'afterHookedMethod 也应当被调用');
assert.ok(texts.includes('Hello World'), `应当看到示例应用的标题文案，实际: ${JSON.stringify(texts.slice(0, 6))}`);

const allViews = [];
const walk = (view) => {
  if (!view) return;
  allViews.push(view);
  for (const child of view.children || []) walk(child);
  if (view.child) walk(view.child);
};
walk(engine.screen.decorView);
const allText = allViews.map((view) => String(view.text || '')).filter(Boolean);
assert.ok(
  allText.some((item) => item.includes('Hooked Hello World')),
  `beforeHookedMethod 的参数改写应当生效，实际视图文案: ${JSON.stringify(allText.slice(0, 8))}`
);

// 解绑后不再记录：拿真实的 TextView 再调一次 setText
const titleView = allViews.find((view) => String(view.text || '').includes('Hooked Hello World'));
assert.ok(titleView, '应当能在视图树里找到标题');
const before = texts.length;
engine.xposed.clear();
assert.equal(engine.xposed.active, false);
const titleObject = titleView.$object || titleView;
engine.vm.invoke(
  {
    classDesc: 'Landroid/widget/TextView;',
    name: 'setText',
    proto: { descriptor: '(Ljava/lang/CharSequence;)V', parameters: ['Ljava/lang/CharSequence;'], returnType: 'V' },
  },
  titleObject,
  ['after-clear'],
  'virtual'
);
assert.equal(texts.length, before, 'clear 之后不应再触发拦截');

console.log('hooks apk OK', { intercepted: texts.length, rewritten: true });
