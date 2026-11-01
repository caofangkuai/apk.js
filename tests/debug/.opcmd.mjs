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
const brs=[]; const origInvoke=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){ const r=origInvoke(ref,recv,args,mode,caller); if(ref.classDesc==='Landroidx/fragment/app/a;'&&ref.name==='<init>') brs.push(recv); return r; };
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
function fieldVal(o,name){ if(!o.$fields)return undefined; for(const [k,val] of o.$fields){ if(k.endsWith('->'+name)) return val; } return undefined; }
for(const br of brs){
  const ops=fld(br,'p;->a:Ljava/util/ArrayList;');
  if(!ops.$fields){continue;}
  for(const [k,val] of ops.$fields){ if(k.endsWith('->a')||k==='a'){ const arr=val; console.log('ops array len=', arr?.length ?? arr?.array?.length); } }
}
