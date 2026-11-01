globalThis.__MNV=1;
globalThis.__CFM=1;
globalThis.__RVT=1;

globalThis.__MT2=1;
globalThis.__MT=1;
globalThis.__TB=1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);
canvas.style={}; canvas.clientWidth=360; canvas.clientHeight=720;
canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const dec = eng.screen?.decorView;
console.log('HASDECOR', !!dec, 'act=', act?.$dexClass?.descriptor);
function dump(v,d){if(!v)return;const t=(v.$descriptor||v.$nativeClass||'?').split('/').pop().replace(';','')+'/'+(v.constructor?.name||'?')+(v.layoutParams?'['+v.layoutParams.width+'x'+v.layoutParams.height+']':'');const k=v.children||[];const L=v.left??'?',T=v.top??'?',W=(typeof v.getWidth==='function'?v.getWidth():(v.right-v.left)),H=(typeof v.getHeight==='function'?v.getHeight():(v.bottom-v.top));console.log('  '.repeat(d)+t+` [${L},${T}] ${W}x${H} ch=${k.length}`);for(const c of k)dump(c,d+1);}
dump(dec,0);
function find(v,pred){ if(!v)return null; if(pred(v))return v; for(const c of v.children||[]){const r=find(c,pred); if(r)return r;} return null; }
const tab=find(dec,v=>/material\/tabs\/TabLayout/.test(v.$descriptor||''));
if(tab&&tab.$javaObject){ const o=tab.$javaObject; const get=(n,t)=>{ for(const [k,v] of o.$fields) if(k.endsWith('->'+n+':'+t)) return v; return undefined; }; console.log('TABMODEv', get('A','I'), 'R', get('R','I'), 'S', get('S','I'), 'D', get('D','I'), 'P', get('P','Z')); }
try { const res = eng.screen?.resources || vm.resources || eng.resources; const xml = res.getLayout(0x7f0c0020); const walk=(n,d)=>{ if(!n)return; if(n.type==='element'){ console.log('XL'+'  '.repeat(d)+n.name+' '+JSON.stringify((n.attrs||[]).map(a=>[a.name,a.value])).slice(0,300)); } for(const c of n.children||[]) walk(c,d+1); }; walk(xml.root,0); } catch(e){ console.log('XMLERR',e.message); }
const res = eng.screen?.resources || vm.resources || eng.resources;
const tb=find(dec,v=>/appcompat\/widget\/Toolbar/.test(v.$descriptor||''));
if(tb){ const o=tb.$javaObject; console.log('TB kids', tb.children.length); if(o) console.log('TBF', [...o.$fields.keys()].filter(k=>/Toolbar->/.test(k)).join('\n'));
  const vm2 = vm; const all = o ? [...o.$fields.entries()].map(([k,v])=>k+'='+(v&&v.$descriptor?'obj':String(v))) : [];
  console.log('TBALL', all.join(' | '));
}

