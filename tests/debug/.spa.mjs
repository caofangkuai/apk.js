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
let sparse;
try {
  sparse = vm.invoke({ classDesc: 'Lf/a/j/c;', name: 'e', proto: { descriptor: '()Landroid/util/SparseArray;' } }, null, [], 'static');
} catch (e) { console.log('ERR', e.message); process.exit(0); }
let peer = sparse;
try { peer = vm.registry.getPeer(sparse) || sparse; } catch (e) {}
console.log('sparse peer keys=', peer && typeof peer === 'object' ? Object.keys(peer).slice(0, 10) : typeof peer);
const ent = peer?.entries;
if (ent) {
  const iter = ent instanceof Map ? [...ent.entries()] : (Array.isArray(ent) ? ent.map((v,i)=>[i,v]) : Object.entries(ent));
  console.log('entries count=', iter.length);
  for (const [k, v] of iter) console.log('  key', k, '=>', String(v).replace(/\n/g, ' | ').slice(0, 100));
}
const items = peer?.items || peer?.values || [];
console.log('type:', typeof items, Array.isArray(items) ? items.length : '');
if (peer?.items) {
  for (const entry of peer.items) {
    if (Array.isArray(entry)) console.log('  key', entry[0], '=>', String(entry[1]).replace(/\n/g, ' | ').slice(0, 100));
    else console.log('  entry', String(entry).slice(0, 100));
  }
}
if (peer?.$fields) {
  for (const [k, v] of peer.$fields) console.log('  field', k, '=>', typeof v);
}
