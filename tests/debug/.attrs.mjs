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
const o=JavaVM.prototype.invokeNative;
let dumped=false;
JavaVM.prototype.invokeNative=function(resolution,receiver,args,ref,mode){
  if(ref&&ref.name==='getAttributeResourceValue'&&!dumped){
    dumped=true;
    const node=receiver?.$attrNode;
    console.error('GARV args=',args.map(a=>typeof a==='string'?a:String(a)),'node.attrs=', JSON.stringify((node?.attrs||[]).map(a=>({n:a.name,nsn:a.namespaceName,dt:a.dataType,rId:a.resId,data:a.data,v:a.value}))).slice(0,800));
  }
  return o.call(this,resolution,receiver,args,ref,mode);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
