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
const o=JavaVM.prototype.executeMethod;
let n=0;
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  if(method&&method.name==='a'&&method.classDesc==='Landroidx/appcompat/widget/v0;'&&(method.proto?.descriptor||'').startsWith('(Landroid/content/Context;Landroid/util/AttributeSet;[I')){
    console.error('v0.a attrs=',args[2]&&(args[2].$data||args[2]),'attrNode=',args[1]?!!args[1].$attrNode:'no');
  }
  return o.call(this,method,thisArg,args);
};
const o2=JavaVM.prototype.invokeNative;
JavaVM.prototype.invokeNative=function(resolution,receiver,args,ref,mode){
  if(ref&&ref.name==='getResourceId'&&n<30){ n++; const r=o2.call(this,resolution,receiver,args,ref,mode); console.error('getResourceId idx=',args[0],'def=',args[1],'=>',r); return r; }
  return o2.call(this,resolution,receiver,args,ref,mode);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
