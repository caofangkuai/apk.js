import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { EmulatorEngine, loadApkFiles } from './dist/android-framework.min.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[3,3]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const logs=[];const engine=new EmulatorEngine({onLog:(l)=>logs.push(l),width:360,height:640});engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){}
const vm=engine.vm; const reg=vm.registry;
const b=reg.resolve('Landroid/os/Build;');
console.log('Build staticValues MODEL=', JSON.stringify(b.staticValues?.get?.('MODEL:Ljava/lang/String;')));
// simulate sget
const mv=vm.getStaticField ? 'has getStaticField' : 'no';
console.log(mv);
const rc=reg.resolve('Landroid/os/Build;');
console.log('nativeDef.staticFields MODEL=', JSON.stringify(rc.nativeDef?.staticFields?.get?.('MODEL:Ljava/lang/String;')));
const f={classDesc:'Landroid/os/Build;',name:'MODEL',type:'Ljava/lang/String;'};
console.log('getStaticField MODEL=', JSON.stringify(vm.getStaticField(f)));
