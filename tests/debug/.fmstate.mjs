import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('start err',e.message);}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const fc=fld(act,'f;->h:Landroidx/fragment/app/f;');
console.log('fc class=',fc?.$runtimeClass?.descriptor);
for(const [k,v] of fc?.$fields||[]) if(k.includes('app/f;->')) console.log('fc',k.split('->')[1],v?(typeof v==='object'?'obj':v):'null');
const fm=fld(fc,'f;->a:Landroidx/fragment/app/j;')||fld(fc,'f;->b:Landroidx/fragment/app/j;');
console.log('fm=',fm?.$runtimeClass?.descriptor);
if(fm) for(const [k,v] of fm.$fields) if(k.endsWith('.q:I')||k.endsWith('.x:Z')||k.endsWith('.y:Z')) console.log('fm',k.split('->')[1],v);
const I=fld(act,'->I:Landroidx/viewpager/widget/ViewPager;'); const v=I.$view;
console.log('children=',v.children.length);
