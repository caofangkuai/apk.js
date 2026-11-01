import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const engine=new EmulatorEngine({onLog:()=>{},width:360,height:640});engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){}
const vm=engine.vm; const res=vm.resources;
const xml=res.getLayout(0x7f0c0015);
const inc=(xml.root.children.find(c=>c.type==='element')).children.find(c=>c.name==='include');
console.log('include attrs', JSON.stringify(inc.attrs?.map(a=>({n:a.name,r:a.resId?('0x'+(a.resId>>>0).toString(16)):null,v:a.value,d:a.data}))));
const la=inc.attrs.find(a=>a.resId===0x010100f2||a.name==='layout');
const rid=(la.value&&la.value.reference!==undefined)?la.value.reference:(la.data>>>0);
console.log('include layout 0x'+(rid>>>0).toString(16));
const x2=res.getLayout(rid>>>0);
function w(n,d){ if(!n)return; if(n.type==='element'){const idA=(n.attrs||[]).find(a=>a.name==='id'||a.resId===0x010100d0); console.log('  '.repeat(d)+n.name+' id='+(idA?('0x'+((idA.data??idA.value?.reference??0)>>>0).toString(16)):'-')); } (n.children||[]).forEach(c=>w(c,d+1)); }
w(x2.root,0);
