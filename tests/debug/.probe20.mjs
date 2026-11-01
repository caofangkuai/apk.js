import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { EmulatorEngine, loadApkFiles } from './dist/android-framework.min.js';
const ctx=new Proxy({measureText:t=>({width:String(t).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[3,3]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const logs=[];
const engine=new EmulatorEngine({onLog:(l)=>logs.push(l),width:360,height:640});engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){console.error('START THREW',e.message);}
for(const l of logs){ if(l.level==='error') console.log('[error] '+(l.tag||'')+': '+l.message); }
const vm=engine.vm; const peer=vm?.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
function w(v,d){if(!v||d>12)return;console.log('  '.repeat(d)+v.constructor?.name+'#'+(v.id>>>0).toString(16));(v.children||[]).forEach(c=>w(c,d+1));}
console.log('ACTIVITY', vm.registry.classNameOf(vm.activity));
w(peer?.window?.decorView,0);
try { engine.screen?.draw?.(); console.log('DRAW OK'); } catch(e){ console.log('DRAW ERR', e.name, e.message); }
