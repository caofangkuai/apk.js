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
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const I=fld(act,'->I:Landroidx/viewpager/widget/ViewPager;'); const v=I.$view;
function getFrag(regs){ if(!regs)return null; for(const r of regs){ if(r&&r.$runtimeClass&&r.$runtimeClass.descriptor==='Landroidx/fragment/app/Fragment;') return r; } return null; }
globalThis.__RHOOK=(pc,op,registers,method)=>{
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='a'&&method.proto.descriptor==='(Landroidx/fragment/app/Fragment;IIIZ)V'){
    if(pc===0x7c||pc===0x7e||pc===0x8e||pc===0x51||pc===0x4b||pc===0x2a||pc===0x18||pc===0x16){
      const f=getFrag(registers);
      const fb=f?[...f.$fields].filter(([k])=>k==='b:I'||k.endsWith('.b:I')||k.endsWith('b:I')).slice(0,2).map(([k,vv])=>k+'='+vv).join(';'):'?';
      console.log('pc0x'+pc.toString(16)+' op=0x'+op.toString(16)+' frag.b='+fb+' v0='+registers[0]+' v11='+registers[11]);
    }
  }
  return false;
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('children=',v.children.length);
