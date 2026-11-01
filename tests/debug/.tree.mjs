import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}})},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){ console.log('STARTERR',e.message); }
await new Promise(r=>setTimeout(r,400));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const decor=fld(act,'mDecor:Landroid/view/View;') || fld(act,'Landroid/view/Window;->mDecor:Landroid/view/View;');
function dump(v,d){ if(!v)return; const cl=v.$descriptor||v.$nativeClass||'?'; const tag=cl.split('/').pop().replace(';',''); const kids=v.children||[]; console.log('  '.repeat(d)+tag+' ch='+kids.length); for(const c of kids) dump(c,d+1); }
const win=fld(act,'mWindow:Landroid/view/Window;');
const dec=win && fld(win,'mDecor:Landroid/view/View;');
console.log('hasDecor=',!!dec);
dump(dec,0);
