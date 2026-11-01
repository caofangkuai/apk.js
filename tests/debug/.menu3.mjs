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
let log=[];
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  const cd=method.classDesc||'';
  if(cd==='Landroidx/appcompat/view/menu/g;'&&method.name==='add'&&(method.proto?.descriptor||'').startsWith('(III')){
    log.push('add g='+(args[0]>>>0).toString(16)+' id='+(args[1]>>>0).toString(16));
  }
  if(cd==='Landroidx/appcompat/view/menu/g;'&&method.name==='findItem'){
    log.push('findItem '+(args[0]===undefined?'UNDEF':(args[0]>>>0).toString(16))+' type='+typeof args[0]);
    if(log.length>10){ console.error(log.splice(0).join('\n')); }
  }
  return o.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
