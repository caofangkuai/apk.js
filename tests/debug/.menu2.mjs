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
let added=[];
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  const cd=method.classDesc||'';
  const d=method.proto?.descriptor||'';
  if(cd==='Landroidx/appcompat/view/menu/g;'&&method.name==='add'&&d.startsWith('(III')){
    added.push({g:args[0]>>>0,id:args[1]>>>0,o:args[2]>>>0}); 
  }
  if(cd==='Landroidx/appcompat/view/menu/g;'&&method.name==='findItem'){
    const r=o.call(this,method,thisArg,args);
    console.error('findItem 0x'+(args[0]>>>0).toString(16),'=>',r===null?'NULL':'found','addedSoFar=',added.slice(-3).map(a=>'g'+a.g.toString(16)+',id'+a.id.toString(16)).join(','));
    return r;
  }
  return o.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
