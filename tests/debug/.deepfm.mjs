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
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
const cn=o=>o?(o.$dexClass?.descriptor||o.$runtimeClass?.descriptor||o.$nativeClass||'?'):'null';
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const ctrl=fld(act,'->h:Landroidx/fragment/app/f;');
console.log('controller=',cn(ctrl));
const host=fld(ctrl,'->a:Landroidx/fragment/app/h;');
console.log('host=',cn(host));
const fm=fld(host,'->f:Landroidx/fragment/app/j;');
console.log('FM=',cn(fm));
if(fm&&fm.$fields){ for(const [k,v] of fm.$fields){ if(/->(r|H|d|e):/.test(k)) console.log('  FM',k.replace('Landroidx/fragment/app/j;->',''),'=',v?(v.$dexClass?.descriptor||v.$nativeClass||v.constructor?.name||typeof v):v); } }
if(host&&host.$fields){ for(const [k,v] of host.$fields){ if(/->(d|f):/.test(k)) console.log('  host',k.replace(/.*->/,''),'=',cn(v)); } }
