import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const orig=JavaVM.prototype.invoke;
let logPop=false;
JavaVM.prototype.invoke=function(ref,recv,args,mode,caller){
  const d=ref.classDesc||'';
  if(logPop && d==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='a'&&(ref.proto?.descriptor||'')==='()V') console.error('>>> populate called recv ok');
  if(d.endsWith('DeviceInfoActivity$j;')&&ref.name==='a') console.error('adapter.a args='+(args?args.length:0));
  if(d==='Landroidx/viewpager/widget/a;'&&ref.name==='a') console.error('PagerAdapter.a args='+(args?args.length:0));
  return orig.call(this,ref,recv,args,mode,caller);
};
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
const vm=eng.vm; const af=vm.activity.$fields;
function getF(s){ for(const [k,v] of af) if(k.endsWith(s)) return v; }
const I=getF('->I:Landroidx/viewpager/widget/ViewPager;');
logPop=true;
console.error('--- direct populate ---');
try{ vm.invoke({classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'a',proto:{descriptor:'()V',parameters:[],returnType:'V'}},I,[],'direct'); console.log('populate ok children=', I.$view.children.length);}catch(e){console.log('populate ERR',e.message);}
