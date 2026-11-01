process.on('uncaughtException', () => {});
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W = 720, H = 1520;
const canvas = Canvas.createCanvas(W, H);
canvas.style = {}; canvas.clientWidth = W; canvas.clientHeight = H;
canvas.addEventListener = () => {}; canvas.removeEventListener = () => {}; canvas.setPointerCapture = () => {};
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
const eng = new EmulatorEngine({ onLog: () => {}, width: W, height: H, density: 2 });
eng.attachCanvas(canvas);
const apk = await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try { await eng.start(apk); } catch (e) {}
await new Promise((r) => setTimeout(r, 1200));
const vm = eng.vm;
function call(cls, name, proto, args = []) {
  try { return vm.invoke({ classDesc: cls, name, proto: { descriptor: proto } }, null, args, 'static'); }
  catch (e) { return 'ERR:' + String(e.message).slice(0, 60); }
}
function show(label, r) {
  if (typeof r === 'string') { console.log(label, '=', r.slice(0, 120)); return; }
  let unwrapped = r;
  try { if (r && typeof r === 'object' && vm.registry?.getPeer) { const p = vm.registry.getPeer(r); if (p) unwrapped = p; } } catch (e) {}
  const items = unwrapped?.items || unwrapped?._items || (Array.isArray(unwrapped) ? unwrapped : null);
  if (items) {
    console.log(label, `List[${items.length}]`);
    items.forEach((v, i) => console.log('   ', i, String(v).slice(0, 90)));
  } else {
    console.log(label, '=<', typeof r, '>');
  }
}
show('j.j.c(Z)', call('Lf/a/j/j;', 'c', '(Z)Ljava/util/ArrayList;', [true]));
show('j.n.a(Z)', call('Lf/a/j/n;', 'a', '(Z)Ljava/util/List;', [true]));
show('j.m.a()', call('Lf/a/j/m;', 'a', '()Ljava/util/List;'));
