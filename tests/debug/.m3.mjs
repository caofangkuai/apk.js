import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now(),300),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const I=fld(act,'->I:Landroidx/viewpager/widget/ViewPager;'); const v=I.$view;
const orig=vm.invoke.bind(vm);
let seq=[];
vm.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'';
  if(d==='Landroidx/fragment/app/o;'||d==='Landroidx/fragment/app/p;'||d==='Landroidx/fragment/app/j;'||d==='Landroidx/fragment/app/i;'){ if(seq.length<50) seq.push(d.split('/').pop()+'.'+ref.name); }
  if(minfName(ref)==='addViewInLayout'||ref.name==='addView'&&d.includes('ViewGroup')) { seq.push('ADDVIEW@'+d.split('/').pop()); }
  var r; try{ r=orig(ref,recv,args,mode,caller);}catch(e){ seq.push('ERR@'+ref.name+':'+e.message); throw e; }
  return r;
};
function minfName(ref){return ref.name;}
const {MeasureSpec}=await import('./src/framework/view.js');
try{ v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY)); }catch(e){console.log('ERR',e.message);}
console.log('children=',v.children.length);
console.log('seq=',seq.join(' > '));
