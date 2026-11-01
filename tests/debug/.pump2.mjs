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
  if(d==='Landroidx/fragment/app/a;'&&n==='c'&&ref.proto?.descriptor==='()V') log.push('BR.executeOps');
  if(n==='addView') log.push('addView');
  return oi(ref,recv,args,mode,caller);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
console.log('after measure: children=',v.children.length,'log=',log.join(','));
// pump: 执行 pending runnables via vm message queue / handler
function pump(n){ for(let i=0;i<n;i++){ try{ if(vm.looper&&vm.looper.drain) vm.looper.drain(); if(eng.pumpMessages) eng.pumpMessages(); if(vm.messageQueue&&vm.messageQueue.dispatch) vm.messageQueue.dispatch(); }catch(e){ console.log('pump err',e.message);} } }
for(let round=0; round<10; round++){
  await new Promise(r=>setTimeout(r,20));
  pump(5);
  if(v.children.length>0){ console.log('round',round,'children=',v.children.length); break; }
}
console.log('final children=',v.children.length,'log=',log.join(','));
