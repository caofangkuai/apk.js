import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:String(t).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[3,3]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const logs=[];
const engine=new EmulatorEngine({onLog:(l)=>logs.push(l),width:360,height:640});engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){console.error('START THREW', e.name, e.message);}
for(const l of logs){ if(l.level==='error'||l.level==='warn'&&/contains|array-length|null/i.test(l.message||'')) console.log('['+l.level+'] '+(l.tag||'')+': '+l.message); }
console.log('=== errors above ===');
