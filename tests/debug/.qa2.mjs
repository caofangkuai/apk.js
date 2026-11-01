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
    console.error('q.a ctx=',args[0],'stack=',(this.methodStack||[]).slice(-3).join('<'));
  }
  return o2.call(this,method,thisArg,args);
};
const oi=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(method,thisArg,args,mode){
  const r=oi.call(this,method,thisArg,args,mode);
  if(method&&method.name==='getContext'&&(method.proto?.descriptor==='()Landroid/content/Context;')&&(r===null||r===undefined)){
    console.error('getContext=>NULL thisArgCls=',thisArg?.$peer?.constructor?.$descriptor||thisArg?.$constructor?.$descriptor||'?','refCls=',method.classDesc);
  }
  return r;
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
