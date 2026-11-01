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
function len(l){ if(!l)return 'null'; if(Array.isArray(l.items))return l.items.length; if(l.$peer&&Array.isArray(l.$peer.items))return l.$peer.items.length; if(Array.isArray(l))return l.length; return '?'; }
const log=[]; const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'',n=ref.name,p=ref.proto?.descriptor||'';
  if(p==='(Ljava/util/ArrayList;Ljava/util/ArrayList;)Z'){ log.push('genOps A.len='+len(args[0])+' B.len='+len(args[1])); const r=oi(ref,recv,args,mode,caller); log.push('  after genOps A.len='+len(args[0])+' ret='+r); return r; }
  if(d==='Landroidx/fragment/app/j;'&&p==='(Ljava/util/ArrayList;Ljava/util/ArrayList;II)V'){ log.push('EXEC4 A.len='+len(args[0])+' B.len='+len(args[1])+' from='+args[2]+' to='+args[3]); return oi(ref,recv,args,mode,caller); }
  if(d==='Landroidx/fragment/app/j;'&&p==='(Ljava/util/ArrayList;Ljava/util/ArrayList;IILb/d/b;)I'){ log.push('EXEC5 A.len='+len(args[0])); return oi(ref,recv,args,mode,caller); }
  return oi(ref,recv,args,mode,caller);
};
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log(log.join('\n')||'(none)');
console.log('children=',v.children.length);
