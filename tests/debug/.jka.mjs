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
const log=[]; const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'',n=ref.name;
  if(d==='Landroidx/fragment/app/j;'&&n==='a'&&ref.proto?.descriptor==='(Landroidx/fragment/app/j$k;Z)V'){
    log.push('execPendingActions callback='+ (args[0]?.$runtimeClass?.descriptor||'?'));
  }
  if(d==='Landroidx/fragment/app/j;'&&n==='c'&&ref.proto?.descriptor==='(Z)V') log.push('execInternal(Z)');
  if(d.startsWith('Landroidx/fragment/app/j$')&&n==='a'&&ref.proto?.descriptor?.includes('ArrayList;Ljava/util/ArrayList;)Z')) log.push('callback.a(al,al)Z class='+d.split('/').pop()+' A.size='+(args[0]?.$fields?.get?.('Ljava/util/ArrayList;->a:[Ljava/lang/Object;')?.length??'?'));
  if(d==='Landroidx/fragment/app/a;'&&n==='c') log.push('>>> BR.executeOps');
  return oi(ref,recv,args,mode,caller);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,100));
console.log(log.join('\n')||'(none)');
console.log('children=',v.children.length);
