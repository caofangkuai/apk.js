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
process.on('unhandledRejection',()=>{});
try{await eng.start(apk);}catch(e){}
const vm=eng.vm;
const clsDesc='Ljava/lang/Class;';
function nat(desc,name){ const c=vm.registry.resolve(desc); return {c}; }
const clsObj=vm.getClassObject('Landroid/os/SystemProperties;');
console.log('clsObj keys', Object.keys(clsObj).slice(0,6), 'desc', clsObj.$descriptor);
// string
const s=typeof clsObj !== 'undefined';
// build param array
const arr=vm.newArray('[Ljava/lang/Class;',1,null);
arr.$data[0]=vm.getClassObject('Ljava/lang/String;');
console.log('arr',arr.$data[0]?.$descriptor);
// invoke getMethod on Class
const clR=vm.registry.resolve('Ljava/lang/Class;');
const gm=clR.nativeDef.methods.get('getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;');
try{ const m=gm.cls? null : gm(Object.assign(Object.create(null),{...clsObj}),['get',arr],vm); console.log('gm result',!!m, m?.$peer?.name); }catch(e){console.log('GMERR',e.message);}
