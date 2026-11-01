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
try{await eng.start(apk);}catch(e){}
const vm=eng.vm; const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
const dec=peer.window.decorView;
function find(v,id){ if(!v)return null; if((v.id>>>0)===id)return v; for(const c of v.children||[]){const f=find(c,id);if(f)return f;} return null;}
// access H/I/K objects via activity fields
const af=vm.activity.$fields;
for(const [k,v] of af){ if(k.includes('DeviceInfoActivity;->H:')||k.includes('DeviceInfoActivity;->I:')||k.includes('DeviceInfoActivity;->K:')){
  console.log('=== '+k);
  if(v&&v.$fields){ for(const [fk,fv] of v.$fields){ if(fv!==null&&fv!==0&&fv!=='') console.log('   ',fk,'=',fv?.$dexClass?'obj('+vm.registry.classNameOf(fv).split('/').pop()+')':fv); } }
}}
