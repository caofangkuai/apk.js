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
  catch (e) { return 'ERR:' + String(e.message).slice(0, 80); }
}
const list = [
  ['Lf/a/j/m0/c;', 'a', '()Ljava/lang/String;'],
  ['Lf/a/j/m0/c;', 'b', '(Z)Ljava/util/ArrayList;'],
  ['Lf/a/j/m0/c;', 'c', '()Ljava/lang/String;'],
  ['Lf/a/j/m0/c;', 'd', '()Ljava/lang/String;'],
  ['Lf/a/j/k0/b;', 'd', '()Ljava/lang/String;'],
  ['Lf/a/j/k0/b;', 'k', '()Ljava/lang/String;'],
  ['Lf/a/j/k0/a;', 'b', '()Ljava/lang/String;'],
  ['Lf/a/j/k0/a;', 'c', '()Ljava/lang/String;'],
  ['Lf/a/j/k0/a;', 'd', '()Ljava/lang/String;'],
];
for (const [c, n, p] of list) {
  const args = p.includes('(Z)') ? [true] : [];
  const r = call(c, n, p, args);
  let out;
  if (typeof r === 'string') out = r;
  else if (r && r.items) out = `List[${r.items.length}] ` + r.items.map(String).join(',');
  else if (r && typeof r === 'object' && r.$fields) out = 'JavaObj ' + (r.$dexClass?.descriptor||'');
  else out = `<${typeof r}>`;
  console.log(`${c.split('/').pop()}${n} => ${String(out).slice(0, 200)}`);
}
