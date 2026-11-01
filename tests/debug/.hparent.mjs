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
let frags=[]; const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){
  if(ref.classDesc==='Landroidx/fragment/app/p$a;'&&ref.name==='<init>'&&args[1]) frags.push(args[1]);
  if(ref.classDesc==='Landroidx/fragment/app/p;'&&ref.name==='a'&&ref.proto.descriptor==='(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/p;'&&args[1]) frags.push(args[1]);
  return oi(ref,recv,args,mode,caller);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('num frags=',frags.length);
for(const f of frags){
  let H,G,b,w; for(const [k,val] of f.$fields){ if(k.endsWith('->H'))H=val; if(k.endsWith('->G'))G=val; if(k.endsWith('->b'))b=val; if(k.endsWith('->w'))w=val; }
  console.log('frag',f.$runtimeClass?.descriptor,'w(containerId)=',w,'b=',b,'H(mView)=',H?(H.$runtimeClass?.descriptor||'JSView'):'null','G(mContainer)=',G?G.$runtimeClass?.descriptor||'JSView':'null');
  if(H){ const hv=H.$view||H; console.log('   H.view parent=',hv.parent?('has'):'null', 'H.view class=',hv.$runtimeClass?.descriptor||hv.constructor?.name); }
}
console.log('vp children=',v.children.length);
