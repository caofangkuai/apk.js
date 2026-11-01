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
const vm0=JavaVM.prototype; const o2=vm0.getField;
let seen=new Set();
const oinv=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(method,thisArg,args,mode){
  if(method&&method.name==='getResources'){
    let recvPeer=null;
    try{recvPeer=thisArg?.$peer;}catch{}
    if(thisArg==null||recvPeer==null){ const st=(this.methodStack||[]).slice(-10).join('<'); if(!seen.has(st)){seen.add(st); console.error('GR-NULLRECV thisArg=',thisArg,'stack=',st);} }
  }
  return oinv.call(this,method,thisArg,args,mode);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
