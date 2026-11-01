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
const act = vm.activity;
const frag = act && [...(act.$fields || [])].find(([k]) => k.includes('fragment'))?.[1];
let target = frag;
const dec = eng.screen?.decorView;
const found = [];
function walk(v, d) {
  if (!v) return;
  const cls = v.$dexClass?.descriptor || v.$descriptor || '';
  if (cls.includes('RecyclerView')) found.push(v);
  for (const c of v.children || []) walk(c, d + 1);
}
if (dec) walk(dec, 0);
console.log('rv count=', found.length);
for (const rv of found) console.log('RV keys=', [...(rv.$fields||new Map()).keys()].join(','));
for (const rv of found) {
  const ad = [...(rv.$fields || [])].find(([k]) => k.toLowerCase().includes('adapter'))?.[1] || rv.adapter || rv.mAdapter;
  console.log('adapter=', !!ad, ad?.$dexClass?.descriptor || '');
  if (!ad) continue;
  for (const [k, v] of ad.$fields || []) {
    if (Array.isArray(v)) console.log(' arr field', k, 'len', v.length);
    else if (v && v.items) console.log(' list field', k, 'len', v.items.length, 'sample', String(v.items[0]).slice(0, 50));
    else if (typeof v === 'object' && v) console.log(' obj field', k, v.$dexClass?.descriptor || typeof v);
  }
}
