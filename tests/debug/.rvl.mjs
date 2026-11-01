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
const orig=JavaVM.prototype.executeMethod;
let cnt=0;
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  const cd=method.classDesc||'';
  if(cd==='Landroidx/recyclerview/widget/RecyclerView;'&&method.name==='l'&&cnt<8){
    const r=orig.call(this,method,thisArg,args);
    cnt++;
    const v=Array.isArray(args)?args[0]:undefined;
    let lpd='?', holder=null;
    if(v&&v.$peer&&v.$peer.object){
      const vm=this;
      try{
        const lp=vm.getField(v,'mLayoutParams');
        lpd=lp?(lp.$dexClass?.descriptor||'obj'):'NULL';
        if(lp) holder=vm.getField(lp,'a');
      }catch(e){lpd='ERR:'+e.message;}
    }
    console.error('RV.l ret=',r?r.$dexClass?.descriptor||'obj':'NULL','view=',v?(typeof v==='object'?'obj':'prim'):v,'argsLen=',Array.isArray(args)?args.length:'no');
    return r;
  }
  return orig.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
