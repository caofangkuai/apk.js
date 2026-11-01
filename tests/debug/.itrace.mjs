import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
const vm=eng.vm;
let trace=false; const seq=[];
const orig=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,caller){
  if(trace){ const d=(ref.classDesc||'').split('/').pop()+'.'+ref.name; if(/^[^.]*\.(a|b|c|d|e|f|g)$/.test(d)||d.includes('addView')||d.includes('commit')||d.includes('execute')){ if(seq.length<60) seq.push(d+'('+(args?args.length:0)+')'); } }
  return orig.call(this,ref,recv,args,mode,caller);
};
const af=vm.activity.$fields;
function getF(s){ for(const [k,v] of af) if(k.endsWith(s)) return v; }
const I=getF('->I:Landroidx/viewpager/widget/ViewPager;');
const A=getF('->H:Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;');
trace=true;
try{ const o=vm.invoke({classDesc:'Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;',name:'a',proto:{descriptor:'(Landroid/view/ViewGroup;I)Ljava/lang/Object;',parameters:['Landroid/view/ViewGroup;','I'],returnType:'Ljava/lang/Object;'}},A,[I.$view,0],'virtual'); console.log('return=', o? vm.registry.classNameOf(o):'null'); }catch(e){console.log('ERR',e.message);}
trace=false;
console.log('VP children=',I.$view.children.length);
console.log('trace:', seq.join(' > '));
