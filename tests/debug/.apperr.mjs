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
const vm0=eng.vm;
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm;
// re-run Application.onCreate with stack
const app=vm.applicationObject;
console.log('app=',app?.$runtimeClass?.descriptor);
const oi=vm.invoke.bind(vm);
vm.methodStack=[];
try{
  vm.invoke({classDesc:app.$runtimeClass.descriptor,name:'onCreate',proto:{descriptor:'()V',parameters:[],returnType:'V'}}, app, [], 'virtual');
}catch(e){ console.log('onCreate ERR:',e.message); console.log(e.stack?.split('\n').slice(0,12).join('\n')); }
