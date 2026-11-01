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
const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){
  if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='a'&&ref.proto?.descriptor==='(Landroidx/fragment/app/j$k;Z)V'){
    console.log('EXECPENDING called with arg0.class=', args[0]?.$runtimeClass?.descriptor, 'arg0=', args[0]?.constructor?.name, 'arg1=', args[1]);
    console.log('  is arg0 === BackStackRecord? recv.a size...');
    return oi(ref,recv,args,mode,caller);
  }
  if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='a'&&ref.proto?.descriptor==='(Landroidx/fragment/app/a;ZZZ)V'){
    console.log('scheduleCommit/addBackStack called', args[0]?.$runtimeClass?.descriptor);
  }
  return oi(ref,recv,args,mode,caller);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
console.log('children=',v.children.length);
