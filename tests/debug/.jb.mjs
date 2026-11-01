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
function arrlen(l){ if(!l)return 'null'; if(Array.isArray(l.$peer?.items))return l.$peer.items.length; if(Array.isArray(l.items))return l.items.length; if(Array.isArray(l))return l.length; return '?'; }
vm.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'',p=ref.proto?.descriptor||'';
  if(d==='Landroidx/fragment/app/a;'&&p==='()V'){ /* commit */ }
  if(d==='Landroidx/fragment/app/j;'&&p==='(Ljava/util/ArrayList;Ljava/util/ArrayList;II)V') console.log('EXEC4 A='+arrlen(args[0])+' B='+arrlen(args[1])+' '+args[2]+','+args[3]);
  if(d==='Landroidx/fragment/app/j;'&&p==='(Ljava/util/ArrayList;Ljava/util/ArrayList;)Z'){ const r=oi(ref,recv,args,mode,caller); console.log('genOps ret='+r+' A='+arrlen(args[0])+' B='+arrlen(args[1])); return r; }
  return oi(ref,recv,args,mode,caller);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
// 直接看 fm.C 和 mBackStack 当前状态
const I2=fld(act,'->I:Landroidx/viewpager/widget/ViewPager;');
console.log('children=',v.children.length);
