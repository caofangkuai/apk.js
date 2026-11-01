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
function findM(desc,name){ const c=vm.registry.resolve(desc); const dc=c?.dexClass; if(!dc)return null; for(const m of [...(dc.directMethods||[]),...(dc.virtualMethods||[])]) if(m.name===name) return m; return null; }
for(const [d,n,a] of [['Lf/a/j/h0/e;','h',[]],['Lf/a/j/h0/e;','c',['Hardware']],['Lf/a/j/b0;','b',['ro.soc.model']]]){
 try{ const r=vm.executeMethod(findM(d,n),null,a); console.log(n,'=',JSON.stringify(r)); }catch(e){console.log(n,'ERR',e.message);}
}
const em=findM; 
const cls=vm.registry.resolve('Lf/a/j/h0/e;');
const hmField=cls.staticValues?.get('c:Ljava/util/HashMap;');
console.log('staticMap c=',!!hmField, hmField&&Object.keys(hmField));
const hm=vm.registry.resolve('Ljava/util/HashMap;');
console.log('HashMap methods', [...(hm.nativeDef?.methods?Object.keys(hm.nativeDef.methods):[])]);
console.log('nativeDef keys', Object.keys(hm.nativeDef||{}));
console.log('has methods?', hm.nativeDef?.methods?.constructor?.name, hm.nativeDef?.methods?.size);
if(hm.nativeDef?.methods) for(const k of hm.nativeDef.methods.keys()) console.log('  M',k);
