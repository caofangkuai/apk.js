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
const brs=[]; let addv=null; const oi=vm.invoke.bind(vm);
vm.invoke=function(ref,recv,args,mode,caller){ const r=oi(ref,recv,args,mode,caller); if(ref.classDesc==='Landroidx/fragment/app/a;'&&ref.name==='<init>') brs.push(recv); return r; };
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
const seq=[]; let tracking=false;
vm.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'';
  if(d==='Landroidx/fragment/app/j;'&&ref.name==='a'&&ref.proto.descriptor==='(Landroidx/fragment/app/Fragment;IIIZ)V'){ tracking=true; addv=args[0]; seq.push('>>> j.a(Frag,IIIZ) args='+JSON.stringify(args&&args.slice?args.slice(1):[])); }
  if(tracking&&d==='Landroidx/fragment/app/Fragment;'&&ref.name!=='<init>') seq.push('  Frag.'+ref.name+ref.proto.descriptor);
  const r=oi(ref,recv,args,mode,caller);
  if(d==='Landroidx/fragment/app/j;'&&ref.name==='a'&&ref.proto.descriptor==='(Landroidx/fragment/app/Fragment;IIIZ)V'){ tracking=false; seq.push('<<< j.a(Frag,IIIZ) done'); }
  return r;
};
for(const br of brs){ try{ oi({classDesc:'Landroidx/fragment/app/a;',name:'c',proto:{descriptor:'()V',parameters:[],returnType:'V'}},br,[],'virtual'); }catch(e){ seq.push('ERR '+e.message);} console.log('children=',v.children.length); }
console.log(seq.slice(0,30).join('\n'));
if(addv&&addv.$fields){ console.log('--- frag fields G,H,booleans ---'); for(const [k,val] of addv.$fields){ if(/->[GH]==/.test(k)||/->[a-z]==/.test(k)&&typeof val==='boolean') console.log(' ',k.split('->')[1],'=',val); } }
