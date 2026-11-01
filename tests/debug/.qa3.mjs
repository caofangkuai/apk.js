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
const n=JavaVM.prototype.invokeNative;
JavaVM.prototype.invokeNative=function(resolution,receiver,args,ref,mode){
  const r=n.call(this,resolution,receiver,args,ref,mode);
  if(ref&&ref.name==='getContext'&&(r===null||r===undefined)) console.error('GC-NULL receiverDesc=',receiver?.$peer?.constructor?.$descriptor||receiver?.$descriptor||'?','def=',resolution.def?.descriptor);
  return r;
};
const o2=JavaVM.prototype.executeMethod;
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  if(method&&method.classDesc==='Lcom/google/android/material/internal/q;'&&method.name==='a') console.error('q.a ctx=',args[0],'argsLen=',args.length,'proto=',method.proto?.descriptor);
  return o2.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
