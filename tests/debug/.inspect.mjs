import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const engine=new EmulatorEngine({onLog:()=>{},width:360,height:720});engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){}
const res=engine.vm.resources;
for(const id of [0x7f0c0015,0x7f0c0014]){
  const xml=res.getLayout(id); console.log('== layout 0x'+(id>>>0).toString(16));
  function w(n,d){ if(!n)return; if(n.type==='element'){ const a=(n.attrs||[]).map(a=>a.name+'='+(a.value?.reference!==undefined?('@0x'+(a.value.reference>>>0).toString(16)):a.value?.string??a.data)); console.log('  '.repeat(d)+n.name+' {'+a.join(', ')+'}'); } (n.children||[]).forEach(c=>w(c,d+1)); }
  w(xml.root,0);
}
