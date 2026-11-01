import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(0),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){}
const vm=eng.vm,reg=vm.registry;
// find NavigationView descriptor in dex
const nv='Lcom/google/android/material/navigation/NavigationView;';
const rc=reg.resolve(nv);
console.log('NavigationView resolve:', !!rc, 'dexClass?', !!rc?.dexClass, 'native?', !!rc?.nativeDef);
const g='Landroidx/appcompat/view/menu/g;';
const rg=reg.resolve(g);
console.log('MenuBuilder resolve:', !!rg, 'dex?', !!rg?.dexClass, 'native?', !!rg?.nativeDef);
if(rg?.dexClass) console.log('MenuBuilder clear code?', !!rg.dexClass.findDeclaredMethod('clear','()V')?.code);
