import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx = new Proxy({measureText:t=>({width:String(t).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const engine=new EmulatorEngine({onLog:()=>{},width:360,height:640});
engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){}
const vm=engine.vm; const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
const vp=peer.window.decorView.findViewById(0x7f0900a0>>>0);
console.log('vp', vp.constructor?.name, 'desc', vp.$descriptor, 'peer', !!vp.$peer);
const rc = vm.registry.resolve(vp.$descriptor || '');
console.log('rc dex', !!rc?.dexClass, 'has setAdapter a:', !!rc?.dexClass?.findDeclaredMethod?.('a','(Landroidx/viewpager/widget/a;)V'));
const jo = vp.$javaObject || vp;
console.log('jo isJava', !!jo.$runtimeClass, 'fields', jo.$fields?.size);
