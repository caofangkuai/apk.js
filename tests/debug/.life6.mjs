import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
let eng0=null; const oe=JavaVM.prototype.executeMethod;
JavaVM.prototype.executeMethod=function(m,t,a){ if(m&&['onStart','onResume'].includes(m.name)&&String(m.classDesc).includes('fragment/app/d')) console.log('DLIFE',m.classDesc,m.name); if(m&&m.name==='startActivity'){} return oe.call(this,m,t,a); };
const ors=JavaVM.prototype.startActivity;
JavaVM.prototype.startActivity=function(i,c){ console.log('STARTACT', i?.$peer?.className||i?.className); try{return ors.call(this,i,c);}catch(e){console.log('SAERR',e.message);throw e;} };
eng0=new EmulatorEngine({onLog:(m)=>{if(m.level==='error')console.log('LOG',m.tag,m.message);},width:360,height:720});eng0.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng0.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,300));
console.log('final act', eng0.vm?.activityDescriptor);
console.log('DONE');
