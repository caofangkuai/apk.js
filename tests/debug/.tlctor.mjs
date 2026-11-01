import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
const vm0=eng; 
try{await eng.start(apk);}catch(e){}
const vm=eng.vm;
// count TabLayout instances and addView on parent
const af=vm.activity.$fields;
function getF(s){ for(const [k,v] of af) if(k.endsWith(s)) return v; return undefined; }
const K=getF('->K:Lcom/google/android/material/tabs/TabLayout;');
// Look at all views under decor with descriptor TabLayout
const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
const dec=peer.window.decorView;
let tls=[];
(function walk(v){ if(v?.$descriptor==='Lcom/google/android/material/tabs/TabLayout;') tls.push(v); for(const c of v?.children||[]) walk(c); })(dec);
console.log('TabLayout views under decor=', tls.length, tls.map(v=>({id:(v.id>>>0).toString(16),children:v.children?.length,size:[v.getWidth?.(),v.getHeight?.()]})));
console.log('K.view === decor TabLayout?', tls.includes(K.$view), 'K.view id=', (K.$view.id>>>0).toString(16));
