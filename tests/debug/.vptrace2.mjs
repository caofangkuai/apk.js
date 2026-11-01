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
// hook vm creation: monkeypatch EmulatorEngine start
const origStart=eng.start.bind(eng);
let patched=false;
const _inv=Object.getPrototypeOf(eng).constructor;
// patch right after vm exists: wrap start
eng.start=async function(a){ await origStart._pre?.(); const p=origStart(a); return p; };
// simpler: patch vm.invoke lazily via defineProperty on engine
let vmRef=null;
Object.defineProperty(eng,'vm',{configurable:true,get(){return vmRef;},set(v){vmRef=v; if(v&&!patched){patched=true; const orig=v.invoke.bind(v); const seen=new Set(); v.invoke=function(ref,recv,args,mode,caller){ const d=ref.classDesc||''; if(d.startsWith('Landroidx/viewpager/')||d.includes('DeviceInfoActivity$j')){ const k=d.split('/').pop()+'.'+ref.name; if(!seen.has(k)){seen.add(k);console.error('CALL '+k);} } return orig(ref,recv,args,mode,caller); }; }});
try{await eng.start(apk);}catch(e){console.error('start err',e.message);}
console.log('seen patched', patched);
