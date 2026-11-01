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
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
// dex ViewPager (I) fields
console.log('=== I (dex ViewPager) fields ===');
let mc=null;
for(const [k,val] of I.$fields){ if(/->[a-z]($|:)/.test(k)&&/ArrayList|View|List/.test(typeof val==='object'&&val?.$runtimeClass?.descriptor||'')) console.log('  ',k.split('->')[1],'=',val?.$runtimeClass?.descriptor||(Array.isArray(val)?'arr':typeof val)); if(k.endsWith('->c')&&val?.$runtimeClass?.descriptor?.includes('ArrayList')) mc=val; }
// dump any ArrayList in I (mItems)
for(const [k,val] of I.$fields){ if(val&&val.$runtimeClass?.descriptor==='Ljava/util/ArrayList;'){ let n=0; for(const [kk,vv] of val.$fields) n=(vv&&vv.array)?vv.array.length:0; } }
// JS v children
console.log('=== JS v.children ===', v.children.length);
// find fragment views by walking activity FM fragments
console.log('=== search all JavaObjects with Fragment.view ===');
