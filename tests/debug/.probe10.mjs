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
try{await engine.start(apk);}catch(e){console.log('ERR',e.message);}
const vm=engine.vm; const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
function dump(v,d){ if(!v||d>20)return; console.log('  '.repeat(d)+(v.constructor?.name||'?')+'#'+v.id+(v.text?' "'+v.text+'"':'')); (v.children||[]).forEach(c=>dump(c,d+1)); }
dump(peer.window.decorView,0);
