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
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm;
// 找 FragmentManagerImpl 实例：遍历所有已分配对象
function dump(o,label){ if(!o)return console.log(label,'null'); console.log(label, vm.registry.classNameOf(o), 'fields=', o.$fields? [...o.$fields.keys()].filter(k=>/->(r|H|d|f):/.test(k)).map(k=>k.replace(/.*->/,'' )+'='+(o.$fields.get(k)?'['+vm.registry.classNameOf(o.$fields.get(k))+']':String(o.$fields.get(k)))).join(', '):'no fields'); }
// 从 activity 找 fragmentmanager
for(const [k,v] of vm.activity.$fields){ if(k.includes('FragmentManager')||/->(m|n|o):/.test(k)){ } }
// 遍历 registry 记录的对象? 改为从 d(fragmentActivity) 找
const act=vm.activity;
const dexc = act.$dexClass?.descriptor;
console.log('activity class=', dexc);
for(const [k,v] of act.$fields){ if(v && v.$dexClass && v.$dexClass.descriptor==='Landroidx/fragment/app/j;'){ console.log('found FM field',k); dump(v,'FM'); const r=v.$fields?[...v.$fields].find(([kk])=>kk.endsWith('->r:Landroidx/fragment/app/h;'))?.[1]:null; dump(r,'host r'); if(r){ const d=[...r.$fields].find(([kk])=>kk.endsWith('->d:Landroid/os/Handler;'))?.[1]; dump(d,'host.d'); } } }
console.log('=== scan all fields for FM (j) ===');
for(const [k,v] of act.$fields){ if(v && v.$dexClass){ console.log(k, '=>', v.$dexClass.descriptor); } }
