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
try{await eng.start(apk);}catch(e){console.log('err',e.message);}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const fc=fld(act,'h:Landroidx/fragment/app/f;');
const host=fld(fc,'a:Landroidx/fragment/app/h;');
const fm=fld(host,'f:Landroidx/fragment/app/j;');
const I=fld(act,'I:Landroidx/viewpager/widget/ViewPager;'); const v=I.$view;
console.log('before q=',fld(fm,'q:I'),'children=',v.children.length);
// 强制 dispatchResume
try{ vm.invoke({classDesc:'Landroidx/fragment/app/j;',name:'d',proto:{descriptor:'(I)V',parameters:[{desc:'I'}],returnType:'V'}}, fm, [5], 'virtual'); }catch(e){console.log('force d(5) err',e.message);}
console.log('after q=',fld(fm,'q:I'),'children=',v.children.length);
// 再 measure
const {MeasureSpec}=await import('./src/framework/view.js');
v.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
await new Promise(r=>setTimeout(r,50));
console.log('after measure children=',v.children.length);
for(const c of v.children) console.log('  child', c.$descriptor||c.constructor?.$descriptor||'?', c.width+'x'+c.height);
