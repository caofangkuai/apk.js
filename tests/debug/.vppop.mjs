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
// call adapter getCount
try{ const n=vm.invoke({classDesc:'Lru/andr7e/deviceinfohw/DeviceInfoActivity$j;',name:'a',proto:{descriptor:'()I',parameters:[],returnType:'I'}},A,[],'virtual'); console.log('getCount=',n); }catch(e){console.log('getCount err',e.message);}
// call ViewPager.getAdapter
try{ const ad=vm.invoke({classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'getAdapter',proto:{descriptor:'()Landroidx/viewpager/widget/a;',parameters:[],returnType:'Landroidx/viewpager/widget/a;'}},I,[],'virtual'); console.log('getAdapter=',!!ad); }catch(e){console.log('getAdapter err',e.message);}
let h=null,c=null; for(const [k,v] of I.$fields){ if(k.endsWith('->h:I'))h=v; if(k.endsWith('->c:Ljava/util/ArrayList;'))c=v; }
console.log('mCurItem(h)=',h,'mItems(c) native size=', c?.['$data']?.length ?? c?.$list?.length ?? 'n/a', 'c keys=', c?Object.keys(c).slice(0,8):'-');
