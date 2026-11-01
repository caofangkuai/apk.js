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
const dec=peer.window.decorView;
console.log('dec===__decorView', dec===vm.__decorView);
console.log('dec.contentHost.id', dec.contentHost?.id, 'children', dec.children.map(c=>c.constructor.name+'#'+c.id));
console.log('dec.contentHost.children', dec.contentHost?.children?.map(c=>c.constructor.name+'#'+c.id));
console.log('dec.contentHost===__contentHost', dec.contentHost===vm.__contentHost);
console.log('dec.contentFrame.parent', dec.contentFrame?.parent?.constructor?.name, dec.contentFrame?.parent?.id);
