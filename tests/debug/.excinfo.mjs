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
const origSA=JavaVM.prototype.startActivity;
JavaVM.prototype.startActivity=function(i,c){try{return origSA.call(this,i,c);}catch(e){const ex=e.javaException;const reg=this.registry;console.log('CLS=',reg.classNameOf(ex),'msg=',ex&&ex.$exceptionMessage);console.log('stack:',(e.stack||'').split('\n').slice(0,14).join('\n  '));throw e;}};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
