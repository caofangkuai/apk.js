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
let done=false;
setTimeout(()=>{ if(done)return; const vm=engine.vm; console.error('STACK:', (vm?.methodStack||[]).slice(-15).join('\n  <- ')); console.error('INV:', vm?.invocationCount, 'frameDepth', vm?.frameDepth); process.exit(0); }, parseInt(process.argv[3]||'15000'));
try{await engine.start(apk);}catch(e){console.error('ERR',e.message);}
done=true; console.error('finished'); process.exit(0);
