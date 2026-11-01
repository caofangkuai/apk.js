import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const orig=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'';
  if(d==='Landroidx/viewpager/widget/ViewPager;'&&(ref.name==='a'||ref.name==='c')){ console.error('VP.'+ref.name+' args='+(args?args.length:0)+' proto='+(ref.proto?.descriptor||'?')+(caller?' from '+caller.name:'')); }
  if(d.endsWith('DeviceInfoActivity$j;')&&ref.name==='a'&&args&&args.length===2){ console.error('ADAPTER instantiateItem pos='+args[1]); }
  try{ const r=orig.call(this,ref,recv,args,mode,caller); if(d==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='a'&&(ref.proto?.descriptor||'').includes(')V') ) console.error('  -> VP.a done recv.children='+(recv?.$view?.children?.length)+' mItems='+(recv?.$fields?[...recv.$fields].find(([k])=>k.endsWith('->c:Ljava/util/ArrayList;'))?.[1]?.items?.length:0)); return r; }catch(e){ console.error('VP.'+ref.name+' THREW '+e.message); throw e; }
};
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.error('start err',e.message);}
