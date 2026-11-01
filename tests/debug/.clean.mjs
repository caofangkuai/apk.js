globalThis.__DBG_ARG=1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from '/workspace/src/framework/engine.js';
const canvas = Canvas.createCanvas(360, 720);
canvas.style = {}; canvas.clientWidth = 360; canvas.clientHeight = 720;
canvas.addEventListener = () => {}; canvas.removeEventListener = () => {}; canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 720 });
const eng = new EmulatorEngine({ onLog: () => {}, width: 360, height: 720 });
eng.attachCanvas(canvas);
const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
await new Promise(r => setTimeout(r, 800));
const vm = eng.vm;
function walk(n, d) {
  if (!n || d > 12) return;
  const cls = n.$descriptor || n.constructor?.name || '?';
  const kids = n.children || [];
  console.log('  '.repeat(d) + cls + ' ch=' + kids.length);
  for (const k of kids) walk(k, d + 1);
}
const act = vm.activity;
const decor = act?.$fields?.get('Landroid/app/Activity;->mWindow:Landroid/view/Window;');
console.log('act=', act?.$dexClass?.descriptor);
const peer = vm.registry.getPeer(act);
walk(peer?.view || peer?.window?.decorView, 0);

// layout dump
function dumpLayout(n, d) {
  if (!n || d > 14) return;
  const cls = n.$descriptor || n.constructor?.name || '?';
  const f = n.$fields;
  const g = (k, t) => { const v = f?.get('L' + (n.$dexClass?.descriptor||'').replace(/^L/,'') + '->' + k + ':' + t); return v; };
  const left = n.left ?? g('mLeft','I'), top = n.top ?? g('mTop','I'), right = n.right ?? g('mRight','I'), bottom = n.bottom ?? g('mBottom','I');
  const vis = n.visibility ?? g('mVisibility','I');
  const txt = n.$peer?.text ?? n.text ?? g('mText','Ljava/lang/CharSequence;');
  console.log('  '.repeat(d) + cls.replace(/^L|;$/g,'') + ` [${left},${top},${right},${bottom}] vis=${vis}` + (txt && typeof txt === 'string' ? ` text="${txt.slice(0,20)}"` : ''));
  for (const k of (n.children || [])) dumpLayout(k, d + 1);
}
dumpLayout(vm.screen?.decorView, 0);

console.log('--- decor ---');
const dv = vm.screen?.decorView;
console.log('dv.$dexClass=', dv?.$dexClass?.descriptor, 'measuredW=', dv?.measuredWidth, 'measuredH=', dv?.measuredHeight);
const f = dv?.$fields;
const keys = ['mLeft','mRight','mTop','mBottom','mMeasuredWidth','mMeasuredHeight'];
for (const k of keys) for (const t of ['I']) { const v = f?.get((dv.$dexClass?.descriptor||'') + '->' + k + ':' + t) ?? f?.get('Landroid/view/View;->'+k+':'+t); if (v !== undefined) console.log(' ', k, '=', v); }
console.log('dv keys sample:', [...(f?.keys()||[])].filter(x=>/mLeft|mRight|mTop|mBottom|Measured/.test(x)).slice(0,10));

console.log('--- kids ---');
for (const k of (vm.screen?.decorView?.children || [])) {
  console.log('kid desc=', k.$descriptor, 'nativeClass=', k.$nativeClass, 'left=', k.left, 'right=', k.right, 'isHostVG=', k instanceof Object, 'ctor=', k.constructor?.name);
  for (const kk of (k.children || [])) console.log('  sub desc=', kk.$descriptor, 'nativeClass=', kk.$nativeClass, 'left=', kk.left, 'right=', kk.right, 'ctor=', kk.constructor?.name);
}
