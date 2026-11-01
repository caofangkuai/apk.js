import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
const origSA=JavaVM.prototype.startActivity;
JavaVM.prototype.startActivity=function(i,c){
  try{return origSA.call(this,i,c);}
  catch(e){
    const ex=e.javaException;
    console.log('SAERR name=',e.name,'msg=',e.message);
    console.log('EX cls=', ex&&ex.$descriptor, 'msg=', ex&&ex.$exceptionMessage);
    const o=(ex&&ex.$peer&&ex.$peer.object)||ex;
    if(o&&o.$fields){ for(const [k,v] of o.$fields) if(/message|detail/i.test(k)) console.log('  field',k,JSON.stringify(v&&v.value!==undefined?v.value:v)); }
    console.log('  stack:', (e.stack||'').split('\n').slice(0,16).join('\n     '));
    throw e;
  }
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
console.log('DONE');
