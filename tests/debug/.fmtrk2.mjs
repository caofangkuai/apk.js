import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:(m)=>{ if(m.level==='error') console.log('LOG',m.tag,m.message);},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
// hook FragmentManager a(...) calls
const vm=eng.vm;
const orig=vm.executeMethod.bind(vm);
vm.executeMethod=function(m,t,a){ if(m&&m.classDesc&&m.classDesc.includes('androidx/fragment/app/') ) { if(['a','d','j','x','k'].includes(m.name)&&/^\(/.test(m.proto?.descriptor||'')&&(m.classDesc.endsWith('/j;')||m.classDesc.endsWith('/h;'))) console.log('FM',m.classDesc,m.name,m.proto?.descriptor,'state', (()=>{try{return this.registry.getPeer(this.activity,this.activity.$descriptor)?.fragmentManager?.q;}catch(_){return '?'}})()); }
 try{return orig(m,t,a);}catch(e){ if(m&&m.classDesc&&m.classDesc.includes('androidx/fragment/app/')) console.log('THROW',m.classDesc,m.name,e.message); throw e; }};
await new Promise(r=>setTimeout(r,100));
console.log('DONE');
