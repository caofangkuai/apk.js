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
const fc=fld(act,'h:Landroidx/fragment/app/f;'); const host=fld(fc,'a:Landroidx/fragment/app/h;'); const fm=fld(host,'f:Landroidx/fragment/app/j;');
const I=fld(act,'I:Landroidx/viewpager/widget/ViewPager;'); const v=I.$view;
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'',n=ref.name,p=ref.proto?.descriptor||'';
  if(n==='getDisplayMetrics'||n==='getResources'){
    let r; try{ r=oi(ref,recv,args,mode,caller); }catch(e){ console.log(n+'THREW recv='+(recv?recv.$runtimeClass?.descriptor||'obj':'NULL')); throw e; }
    console.log(n+' on '+d.split('/').pop()+' recv='+(recv?recv.$runtimeClass?.descriptor?.split('/').pop()||'obj':'NULL')+' -> '+(r===null?'NULL':r===undefined?'undef':(r.$runtimeClass?.descriptor?.split('/').pop()||typeof r)));
    return r;
  }
  return oi(ref,recv,args,mode,caller);
};
try{ vm.invoke({classDesc:'Landroidx/fragment/app/j;',name:'a',proto:{descriptor:'(IZ)V',parameters:[{desc:'I'},{desc:'Z'}],returnType:'V'}}, fm, [2,false], 'virtual'); }catch(e){ console.log('ERR',e.message); }
console.log('children=',v.children.length);
