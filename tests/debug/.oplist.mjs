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
for(const br of brs){
  const ops=fld(br,'p;->a:Ljava/util/ArrayList;');
  console.log('ops raw=',!!ops, ops&&ops.constructor&&ops.constructor.name);
  if(ops && ops.$fields){ for(const [k,val] of ops.$fields){ console.log('  list field',k,'=',val&&(val.array||val.items)?((val.array||val.items).length):String(val)); } }
  // try common accessor
  for(const prop of ['$items','items','array','$array','list']){ if(ops&&ops[prop]) console.log('  ops.'+prop+' len=',ops[prop].length); }
}
for(const br of brs){
  const ops=fld(br,'p;->a:Ljava/util/ArrayList;');
  console.log('=== ops own keys:', Object.keys(ops));
  console.log('=== has $fields?', !!ops.$fields, 'has $items?', !!ops.$items);
  try{ console.log('=== typeof ops.a=', typeof ops.a, Array.isArray(ops.a)); }catch(e){}
  // use vm ArrayList API: find field by scanning all keys
  for(const k of Object.keys(ops)){ let val=ops[k]; if(typeof val==='object'&&val){ console.log('  key',k,'=>',val.constructor?.name, Array.isArray(val)?('[len'+val.length+']'):''); } }
}
