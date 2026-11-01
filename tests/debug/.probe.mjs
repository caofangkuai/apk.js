import fs from 'node:fs';
process.on('uncaughtException', (e) => {});
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
await new Promise((r) => setTimeout(r, 800));
const V = eng.vm;
function call(cls, name, proto, args = []) {
  try { return V.invoke({ classDesc: cls, name, proto: { descriptor: proto } }, null, args, 'static'); }
  catch (e) { return 'ERR:' + e.message; }
}
const probes = [
  ['Lf/a/j/k0/b;', 'd', '()Ljava/lang/String;'],
  ['Lf/a/j/m0/c;', 'a', '()Ljava/lang/String;'],
  ['Lf/a/j/k0/b;', 'b', '()I'],
  ['Lf/a/j/k0/b;', 'e', '()I'],
  ['Lf/a/j/b0;', 'h', '()Ljava/lang/String;'],
  ['Lf/a/j/b0;', 'k', '()Ljava/lang/String;'],
  ['Lf/a/j/b0;', 'l', '()Ljava/lang/String;'],
  ['Lf/a/j/b0;', 'A', '()Z', true],
];
for (const [c, n, p, isInst] of probes) {
  const r = isInst ? 'skip' : call(c, n, p);
  let out;
  try { out = typeof r === 'string' ? r : `[${typeof r}]`; } catch { out = '<obj>'; }
  console.log(`${c.split('/').pop()}.${n} => ${out}`);
}
