import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const seen=new Set();
const origInvoke=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'';
  if((d==='Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;'||d==='Landroidx/viewpager/widget/ViewPager;'||d==='Landroidx/viewpager/widget/a;') ){
    const k=d.split('/').pop()+'.'+ref.name+':'+(ref.proto?.descriptor||'?');
    if(!seen.has(k)){seen.add(k); console.error('CALL '+k);}
  }
  return origInvoke.call(this,ref,recv,args,mode,caller);
};
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.error('start err',e.message);}
console.log('children after start=', eng.vm?.activity?.$fields && (()=>{for(const [k,v] of eng.vm.activity.$fields) if(k.endsWith('->I:Landroidx/viewpager/widget/ViewPager;')) return v.$view.children.length;})());
