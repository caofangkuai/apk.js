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
JavaVM.prototype.executeMethod=function(method,thisArg,args){
  const cd=method.classDesc||'';
  const isQ=cd==='Landroidx/recyclerview/widget/RecyclerView;'&&method.name==='q'&&method.proto?.descriptor==='()V';
  const isA=cd==='Landroidx/recyclerview/widget/RecyclerView;'&&method.name==='a'&&(method.proto?.descriptor==='(Z)V');
  if(isQ||isA){ let f; try{f=this.getField(thisArg,'F');}catch(e){} console.error((isQ?'F++ enter':'F-- enter'),'F=',f,'stack=',(this.methodStack||[]).slice(-4).join('<-')); }
  try{ const r=orig.call(this,method,thisArg,args); if(isQ||isA){let f;try{f=this.getField(thisArg,'F');}catch(e){} console.error((isQ?'F++ exit':'F-- exit'),'F=',f);} return r; }
  catch(e){ if(isQ||isA) console.error((isQ?'F++ THREW':'F-- THREW'),'F=',(()=>{try{return this.getField(thisArg,'F');}catch(x){return '?'}})(),'ex=',this.registry?.classNameOf?.(e.javaException)); throw e; }
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
