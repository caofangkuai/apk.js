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
await new Promise((r) => setTimeout(r, 1500));
const vm = eng.vm;
function call(cls, name, proto, args = []) {
  try { return vm.invoke({ classDesc: cls, name, proto: { descriptor: proto } }, null, args, 'static'); }
  catch (e) { return 'ERR:' + String(e.message).slice(0, 60); }
}
const probes = [
  ['k0/b', 'd', '()Ljava/lang/String;'],
  ['k0/b', 'b', '(Z)Ljava/lang/String;', [true]],
  ['k0/b', 'a', '()Ljava/lang/String;'],
  ['k0/b', 'h', '()Z'],
  ['m0/b', 'b', '()Ljava/lang/String;'],
  ['m0/c', 'a', '()Ljava/lang/String;'],
  ['p', 'a', '(JZ)Ljava/lang/String;', [4000000000, true]],
  ['c', 'b', '()V'],
];
for (const [cls, name, proto, args = []] of probes) {
  const r = call(`Lf/a/j/${cls};`, name, proto, args);
  const out = typeof r === 'string' ? r : `<${typeof r}>`;
  console.log(`${cls}.${name}${proto} => ${out.slice(0, 100)}`);
}
