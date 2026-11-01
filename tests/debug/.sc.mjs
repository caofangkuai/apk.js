import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}})},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
const vm0=()=>eng.vm;
try{await eng.start(apk);}catch(e){ console.log('STARTERR',e.message); }
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm;
const orig=vm.invoke.bind(vm);
let hits=0;
vm.invoke=function(ref,recv,args,mode,cm){
  const r=orig(ref,recv,args,mode,cm);
  if(ref&&ref.name==='setChecked'&&hits<6){hits++;console.error('SETCHECKED recv=',recv&&(recv.$descriptor||recv.$nativeClass),'mode=',mode,'->ret=',r&&(r.$descriptor||r.$nativeClass||typeof r),'sameObj=',r===recv);}
  return r;
};
