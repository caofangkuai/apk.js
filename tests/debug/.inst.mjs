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
function getF(s){ for(const [k,v] of af) if(k.endsWith(s)) return v; return undefined; }
const I=getF('->I:Landroidx/viewpager/widget/ViewPager;');
const A=getF('->H:Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;');
// adapter.d(I)Fragment
try{ const fr=vm.invoke({classDesc:'Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;',name:'d',proto:{descriptor:'(I)Landroidx/fragment/app/Fragment;',parameters:['I'],returnType:'Landroidx/fragment/app/Fragment;'}},A,[0],'virtual'); console.log('d(0) fragment=', fr? vm.registry.classNameOf(fr):'null'); }catch(e){console.log('d(0) ERR',e.message);}
// adapter.a(ViewGroup,I)Object instantiateItem
try{ const o=vm.invoke({classDesc:'Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;',name:'a',proto:{descriptor:'(Landroid/view/ViewGroup;I)Ljava/lang/Object;',parameters:['Landroid/view/ViewGroup;','I'],returnType:'Ljava/lang/Object;'}},A,[I.$view,0],'virtual'); console.log('instantiateItem=', o? vm.registry.classNameOf(o):'null'); }catch(e){console.log('instantiateItem ERR',e.message);}
console.log('VP children=', I.$view.children.length);
