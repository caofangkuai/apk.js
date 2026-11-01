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
const vm0=eng; 
try{await eng.start(apk);}catch(e){}
const vm=eng.vm;
// patch invoke to log ViewPager + adapter calls
const orig=vm.invoke.bind(vm);
const seen=new Set();
vm.invoke=function(ref,recv,args,mode,caller){
  const desc=ref.classDesc||'';
  if(desc==='Landroidx/viewpager/widget/ViewPager;'||desc==='Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;'||desc==='Landroidx/viewpager/widget/a;'){
    const key=desc+'.'+ref.name+ref.parameters?.length;
    if(!seen.has(key)){seen.add(key); console.error('CALL '+desc.split('/').pop()+'.'+ref.name+(ref.parameters?'('+ref.parameters+')':'')+' arity='+(args?args.length:0));}
  }
  return orig(ref,recv,args,mode,caller);
};
// re-trigger setAdapter path? already done. Instead call populate-related: get current
console.log('done initial. calls seen:', [...seen].length);
