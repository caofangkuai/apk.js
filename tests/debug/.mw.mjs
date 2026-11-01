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
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const I=fld(act,'->I:Landroidx/viewpager/widget/ViewPager;');
const v=I.$view;
console.log('descriptor=', v.$descriptor, 'javaObject=', !!v.$javaObject);
try{ const r=vm.findVirtual(v.$descriptor,'onMeasure','(II)V'); console.log('onMeasure resolved kind=', r?.kind, 'cls=', r?.method?.classDesc); }catch(e){console.log('findVirtual ERR',e.message);}
const {MeasureSpec}=await import('./src/framework/view.js');
const ws=MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY), hs=MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY);
try{ v.measure(ws,hs); console.log('after measure: measured=',v.measuredWidth,v.measuredHeight,'children=',v.children.length);}catch(e){console.log('measure ERR',e.message);}
