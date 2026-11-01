import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const hits=[]; let on=false;
const orig=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,caller){
  if(on){ const c=(ref.classDesc||''); if(c.endsWith('/q;')||c.endsWith('/i;')||c.endsWith('/p;')){ if(hits.length<80) hits.push(c.split('/').pop()+'.'+ref.name);} }
  return orig.call(this,ref,recv,args,mode,caller);
};
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
on=true;
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,400));
on=false;
const vm=eng.vm; const af=vm.activity.$fields;
function getF(s){ for(const [k,v] of af) if(k.endsWith(s)) return v; }
const I=getF('->I:Landroidx/viewpager/widget/ViewPager;');
console.log('children=',I.$view.children.length);
console.log('trace:', hits.join(' '));
