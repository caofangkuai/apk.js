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
const o2=JavaVM.prototype.executeMethod;
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  if(method&&method.classDesc==='Lcom/google/android/material/internal/q;'&&method.name==='a'){
    console.error('q.a ctx arg=',args[0], 'isJava=',args[0]&&args[0].$peer?'peer':'?');
  }
  return o2.call(this,method,thisArg,args);
};
const o3=JavaVM.prototype.invokeNative; let done=false;
JavaVM.prototype.invokeNative=function(resolution,receiver,args,ref,mode){
  const r=o3.call(this,resolution,receiver,args,ref,mode);
  if(ref&&ref.name==='getContext'&&!done){ done=true; console.error('getContext host ret=',r, 'args=',args); }
  return r;
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
