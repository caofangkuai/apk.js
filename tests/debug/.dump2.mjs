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
try { peer.relayout(true); } catch (e) { console.log('RELAYOUT_ERR', e.message); }
function walk(n, d) {
  if (!n || d > 14) return;
  const cls = (n.$descriptor || '?').replace(/^L|;$/g, '');
  console.log('  '.repeat(d) + cls + ` [${n.left},${n.top},${n.right},${n.bottom}] vis=${n.visibility}`);
  for (const k of n.children || []) walk(k, d + 1);
}
walk(vm.screen?.decorView, 0);
eng.screen?.invalidate?.();
console.log('peerCtor=', peer?.constructor?.name, 'hasRelayout=', typeof peer?.relayout, 'peerDesc=', peer?.$descriptor);
console.log('screenDecor=', vm.screen?.decorView?.$descriptor, vm.screen?.decorView?.children?.length);
console.log('eng.screen=', eng.screen?.constructor?.name, 'decor=', eng.screen?.decorView?.children?.length);
console.log('sameDecor=', peer.decorView === vm.screen.decorView);
try { peer.relayout(true); console.log('relayout2 ok'); } catch (e) { console.log('relayout2 ERR', String(e.message).slice(0,120)); console.log('STACK', (vm.methodStack||[]).slice(-12).join(' <- ')); }
const d = peer.decorView;
console.log('after: decor=', d?.left, d?.right, 'kidR=', d?.children?.[0]?.right, 'cfR=', d?.children?.[0]?.children?.[1]?.right);
