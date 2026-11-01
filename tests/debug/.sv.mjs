import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const ctx=new Proxy({measureText:t=>({width:8}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(0),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const o=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,receiver,args,mode,cm){
  if(ref&&ref.name==='setVisible') console.error('SV ref=',ref.classDesc,'recv=',receiver===null?'NULL':(receiver===undefined?'UNDEF':'obj'),'mode=',mode,'pc=',this.currentPc,'top=',(this.methodStack||[]).slice(-3).join('<'));
  return o.call(this,ref,receiver,args,mode,cm);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
