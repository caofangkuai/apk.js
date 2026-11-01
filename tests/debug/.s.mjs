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
try{await eng.start(apk);}catch(e){}
const vm=eng.vm; const af=vm.activity.$fields;
let s;
for(const [k,v] of af) if(k.endsWith('->s:Ljava/util/List;')) s=v;
console.log('s=', s? vm.registry.classNameOf(s):'none', 'items=', s?.$peer?.items?.length ?? s?.items?.length);
const items=s?.$peer?.items||s?.items||[];
console.log('first3=', items.slice(0,3).map(v=>vm.registry.classNameOf(v)+':'+JSON.stringify(v?.$peer?.value)));
// Integer.valueOf(0)
const iv=vm.invoke({classDesc:'Ljava/lang/Integer;',name:'valueOf',proto:{descriptor:'(I)Ljava/lang/Integer;',parameters:['I'],returnType:'Ljava/lang/Integer;'}},null,[0],'static');
console.log('iv=', vm.registry.classNameOf(iv), 'val=', iv?.$peer?.value);
const idx=vm.invoke({classDesc:'Ljava/util/List;',name:'indexOf',proto:{descriptor:'(Ljava/lang/Object;)I',parameters:['Ljava/lang/Object;'],returnType:'I'}},s,[iv],'interface');
console.log('indexOf=', idx);
