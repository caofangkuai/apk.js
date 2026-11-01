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
const interp=vm.interpreter; const oExec=interp.execute.bind(interp);
interp.execute=function(method,thisArg,args){
  const isTarget=method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='b'&&method.proto.descriptor==='(Ljava/util/ArrayList;Ljava/util/ArrayList;II)V';
  if(isTarget){
    const a=args.slice();
    const r=oExec(method,thisArg,a);
    return r;
  }
  return oExec(method,thisArg,args);
};
// 直接在 runLoop 前看 registers：用 trace
const oTrace=interp.trace;
interp.trace=function(pc,op,method){
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='b'&&method.proto.descriptor==='(Ljava/util/ArrayList;Ljava/util/ArrayList;II)V'&&pc===0){
    // registers 不在 scope，改用注入
  }
  if(oTrace) return oTrace.call(this,pc,op,method);
};
// patch: hijack execute to snapshot registers at entry
const origExecute=interp.execute.bind(interp);
const DexInterpreter=interp.constructor;
const origRL=DexInterpreter.prototype.runLoop;
DexInterpreter.prototype.runLoop=function(method,registers,handlers,insns,code){
  if(method.classDesc==='Landroidx/fragment/app/j;'&&method.name==='b'&&method.proto.descriptor==='(Ljava/util/ArrayList;Ljava/util/ArrayList;II)V'){
    console.log('j.b ENTRY regs[15..19]='+[15,16,17,18,19].map(i=>{const x=registers[i];return typeof x==='number'?x:(x==null?'null':'obj');}).join(',')+' insSize='+code.insSize+' regs='+code.registersSize);
  }
  return origRL.call(this,method,registers,handlers,insns,code);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('children=',v.children.length);
