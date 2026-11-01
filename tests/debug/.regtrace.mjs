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
// patch interpreter to dump regs at j.a(Fragment;IIIZ) pc 110..145
const interp=vm.interpreter;
const orig=interp.runLoop.bind(interp);
interp.runLoop=function(method,registers,handlers,insns,code){
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='a'&&method.proto.descriptor==='(Landroidx/fragment/app/Fragment;IIIZ)V'){
    // 包一层 trace
    const t=this.trace; let lastpc=-1;
    this.trace=(pc,op,m)=>{ if(pc>=108&&pc<=145&&pc!==lastpc){ lastpc=pc; const regs=registers.map((r,i)=>'v'+i+'='+(r===null?'null':typeof r==='object'?'obj':r)); console.log('  pc'+pc+' op=0x'+op.toString(16)+' '+regs.slice(0,8).join(' ')); } if(t)t(pc,op,m); };
    const r=orig(method,registers,handlers,insns,code);
    this.trace=t; return r;
  }
  return orig(method,registers,handlers,insns,code);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('children=',v.children.length);
