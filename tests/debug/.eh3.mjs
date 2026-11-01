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
process.on('unhandledRejection',()=>{});
try{await eng.start(apk);}catch(e){}
const vm=eng.vm;
const dc=vm.registry.resolve('Lf/a/j/h0/e;').dexClass;
const h=[...dc.directMethods,...dc.virtualMethods].find(m=>m.name==='h'&&(!m.proto?.parameters||!m.proto.parameters.length));
console.log('found h',!!h,'codeunits',h?.insns?.length, 'regs',h?.registersSize,'ins',h?.insSize);
// run with a tracer: monkeypatch executeMethod? instead call and catch
try{ const r=vm.executeMethod(h,null,[]); console.log('result',JSON.stringify(r)); }catch(e){ console.log('ERR',e.message); }
console.log('KEYS', Object.keys(h).join(','));
console.log('insns', h.insns, 'code', h.code);
