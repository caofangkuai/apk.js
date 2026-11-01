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
try{await eng.start(apk);}catch(e){console.log('err',e.message);}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
let n=0;
globalThis.__RHOOK=(pc,op,registers,method)=>{
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='a'&&method.proto.descriptor==='(IZ)V'&&pc===0){
    const is=method.code.insSize, rs=method.code.registersSize; const base=rs-is;
    console.log('j.a(IZ) target='+registers[base+1]+' exec='+registers[base+2]+' (#'+(++n)+')');
  }
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='d'&&method.proto.descriptor==='(I)V'&&pc===0){ const is=method.code.insSize,rs=method.code.registersSize; console.log('j.d(I) state='+registers[rs-is+1]); }
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='q'&&method.proto.descriptor==='()Z'&&pc===0){
    // queryExecuteOps
  }
  return false;
};
const I=(function(){for(const [k,v] of act.$fields) if(k.endsWith('I:Landroidx/viewpager/widget/ViewPager;')) return v;})(); const v=I.$view;
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('children=',v.children.length);
