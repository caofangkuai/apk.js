import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const seen=new Set();
const orig=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'';
  if(d==='Landroidx/viewpager/widget/ViewPager;'){ const k=ref.name+(ref.proto?.descriptor||''); if(!seen.has(k)){seen.add(k); console.error('VP.'+k);} }
  if(d==='Landroidx/viewpager/widget/a;'&&(ref.proto?.descriptor||'').includes('ViewGroup;I')) console.error('>> instantiateItem');
  if(d.endsWith('DeviceInfoActivity$j;')&&ref.name==='c'&&(ref.proto?.descriptor||'')==='(I)Landroidx/fragment/app/Fragment;') console.error('>> adapter.getItem('+args[0]+')');
  return orig.call(this,ref,recv,args,mode,caller);
};
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
let I; for(const [k,v] of act.$fields) if(k.endsWith('->I:Landroidx/viewpager/widget/ViewPager;')) I=v;
console.log('children=',I.$view.children.length);
console.log('VP methods seen:', [...seen].join(' '));
