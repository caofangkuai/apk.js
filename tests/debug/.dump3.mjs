globalThis.__DBG_COORD=1;
globalThis.__DBG_CF=1;
globalThis.__DBG_ARG=1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from '/workspace/src/framework/engine.js';
const W = 360, H = 720;
const canvas = Canvas.createCanvas(W, H);
canvas.style = {}; canvas.clientWidth = W; canvas.clientHeight = H;
canvas.addEventListener = () => {}; canvas.removeEventListener = () => {}; canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
const eng = new EmulatorEngine({ onLog: () => {}, width: W, height: H });
eng.attachCanvas(canvas);
const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
await new Promise(r => setTimeout(r, 1000));
const vm = eng.vm;
const peer = vm.registry.getPeer(vm.activity);
function walk(n, d) {
  if (!n || d > 14) return;
  const cls = (n.$descriptor || '?').replace(/^L|;$/g, '');
  console.log('  '.repeat(d) + cls + ` [${n.left},${n.top},${n.right},${n.bottom}] m=${n.measuredWidth}x${n.measuredHeight} vis=${n.visibility}`);
  for (const k of n.children || []) walk(k, d + 1);
}
walk(peer.decorView, 0);
