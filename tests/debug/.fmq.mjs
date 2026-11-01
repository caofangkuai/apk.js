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
try{await eng.start(apk);}catch(e){console.log('start err',e.message);}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const fc=fld(act,'h:Landroidx/fragment/app/f;');
const host=fld(fc,'a:Landroidx/fragment/app/h;');
console.log('host=',host?.$runtimeClass?.descriptor);
const fm=fld(host,'f:Landroidx/fragment/app/j;');
console.log('fm=',fm?.$runtimeClass?.descriptor);
if(fm) for(const [k,v] of fm.$fields){ const nm=k.split('->')[1]; if(nm==='q:I'||nm==='x:Z'||nm==='y:Z'||nm==='g:Ljava/util/ArrayList;'||nm==='C:Ljava/util/ArrayList;'||nm==='d:Ljava/util/ArrayList;') console.log('  fm',nm,'=',(Array.isArray(v?.$peer?.items)?'list['+v.$peer.items.length+']':v)); }
const I=fld(act,'I:Landroidx/viewpager/widget/ViewPager;'); const v=I.$view;
console.log('children=',v.children.length);
