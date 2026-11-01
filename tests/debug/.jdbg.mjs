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
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,400));
const vm=eng.vm;
function find(v,name){if(!v)return null;const t=(v.$descriptor||v.$nativeClass||'');if(t.includes(name))return v;for(const c of v.children||[]){const r=find(c,name);if(r)return r;}return null;}
const rv=find(eng.screen?.decorView,'RecyclerView');
const jo=rv?.$javaObject;
const lm=jo?.$fields.get('Landroidx/recyclerview/widget/RecyclerView;->m:Landroidx/recyclerview/widget/RecyclerView$o;');
const j=lm?.$fields.get('Landroidx/recyclerview/widget/LinearLayoutManager;->u:Landroidx/recyclerview/widget/j;');
console.log('j dex=', j?.$dexClass?.descriptor, 'peer=', j?.$peer?.constructor?.name, 'type=', j?.$dexClass?.superclass);
for (const m of ['b','c','d','e','f','a']) {
  const cands=(j?.$dexClass?.virtualMethods||[]).filter(x=>x.name===m).map(x=>x.proto?.descriptor);
  console.log('j.'+m+':', cands.join(' | ')||'(none)');
}
