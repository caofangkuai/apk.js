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
  if(method&&method.name==='b'&&method.classDesc==='Lb/a/n/g$b;'&&(method.proto?.descriptor||'')==='(Landroid/util/AttributeSet;)V'){
    const node=args[0]?.$attrNode;
    if(node&&n<2){ n++; console.error('ITEM attrs=',JSON.stringify((node.attrs||[]).map(a=>({n:a.name,dt:a.dataType,rId:(a.resId>>>0).toString(16),data:(a.data>>>0).toString(16),v:typeof a.value==='object'?JSON.stringify(a.value):a.value})))); }
  }
  return o.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
