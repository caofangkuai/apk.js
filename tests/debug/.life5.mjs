import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const origInvoke=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,cm){
  if(ref && (ref.name==='onStart'||ref.name==='onResume'||ref.name==='onPostResume')){
    let rd=null; try{rd=recv?this.registry.classNameOf(recv):null;}catch(e){}
    const res = rd?this.findVirtual(rd,ref.name,ref.proto.descriptor):null;
    console.log('INV',ref.name,'mode',mode,'recv',rd,'res',res?res.kind+':'+(res.method?.classDesc||res.def?.descriptor):'NULL');
  }
  return origInvoke.call(this,ref,recv,args,mode,cm);
};
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
console.log('DONE');
