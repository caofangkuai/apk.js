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
const brs=[]; const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){ const r=oi(ref,recv,args,mode,caller); if(ref.classDesc==='Landroidx/fragment/app/a;'&&ref.name==='<init>') brs.push(recv); return r; };
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
const br=brs[0]; let fm=null; for(const [k,val] of br.$fields) if(k==='Landroidx/fragment/app/a;->r:Landroidx/fragment/app/j;') fm=val;
const d=fld(fm,'j;->d:Ljava/util/ArrayList;');
let pendLen='?'; if(d&&d.$fields){ for(const [k,val] of d.$fields){ pendLen = val?.length ?? val?.$peer?.items?.length ?? '?'; } }
console.log('mPendingActions len=', pendLen);
// force: 把 br 加入 d 然后 execPending
try{
  const arr = (()=>{ for(const [k,val] of d.$fields) return val; })();
  if(Array.isArray(arr)){ arr.push(br); console.log('pushed br to pending, len now', arr.length); }
  oi({classDesc:'Landroidx/fragment/app/j;',name:'a',proto:{descriptor:'(Landroidx/fragment/app/j$k;Z)V',parameters:[],returnType:'V'}},fm,[new (class{ a(){return true;} })(),true],'virtual');
  // 需要真正的 j$k 实现... 这里用 lite 对象可能类型不对
}catch(e){ console.log('force err',e.message); }
console.log('children=',v.children.length);
