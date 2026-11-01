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
globalThis.__RHOOK=(pc,op,registers,method)=>{
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='a'&&method.proto.descriptor==='(Landroidx/fragment/app/Fragment;Z)V'){
    if(pc===0x1d||pc===0x1f||pc===0x4b||pc===0x66||pc===0x4f){
      const f=registers[4];
      const A=f?[...f.$fields].filter(([k])=>k.endsWith('app/Fragment;->A:Z')).map(([k,vv])=>vv):'?';
      const mG=registers[3]?[...registers[3].$fields].filter(([k])=>k.endsWith('j;->g:Ljava/util/ArrayList;')).map(([k,vv])=>Array.isArray(vv?.$peer?.items)?vv.$peer.items.length:vv):'?';
      console.log('addFrag pc0x'+pc.toString(16)+' frag.A='+A+' mAdded.len='+mG);
    }
  }
  return false;
};
const I=(function(){for(const [k,v] of act.$fields) if(k.endsWith('I:Landroidx/viewpager/widget/ViewPager;')) return v;})(); const v=I.$view;
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('children=',v.children.length);
