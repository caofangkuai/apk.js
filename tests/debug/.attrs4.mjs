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
  if(method&&method.classDesc==='Lb/a/n/g$b;'&&method.name==='b'&&(method.proto?.descriptor||'')==='(Landroid/util/AttributeSet;)V'&&n<1){
    n++;
    const a0=args[0];
    console.error('ATTR keys=',JSON.stringify(Object.keys(a0||{})));
    if(a0&&a0.$peer) console.error(' peer keys=',Object.keys(a0.$peer), 'peer.src=', a0.$peer.src?.attrs?.length, 'peer.node=', a0.$peer.node?.name);
    if(a0&&a0.$attrNode) console.error(' attrNode attrs=', a0.$attrNode.attrs?.length);
  }
  return o.call(this,method,thisArg,args);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
