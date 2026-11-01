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
const F={classDesc:'Landroidx/recyclerview/widget/RecyclerView;',name:'F',type:'I'};
let depth=0;
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  const cd=method.classDesc||'';
  let tag=null;
  if(cd==='Landroidx/recyclerview/widget/RecyclerView;'){
    if(method.name==='q'&&method.proto?.descriptor==='()V') tag='Q';
    else if(method.name==='r'&&method.proto?.descriptor==='()V') tag='R';
  }
  if(tag){
    const f=this.getField(thisArg,F);
    console.error(tag,'preF=',f,'depth=',depth,'stack=',(this.methodStack||[]).slice(-5).join('<'));
    const save=this.methodStack;
    try{ const r=o2.call(this,method,thisArg,args); console.error(tag,'postF=',this.getField(thisArg,F)); return r; }
    catch(e){ console.error(tag,'THREW postF=',this.getField(thisArg,F)); throw e; }
  }
  return o2.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
