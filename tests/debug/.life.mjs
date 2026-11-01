import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx=new Proxy({measureText:t=>({width:8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const eng=new EmulatorEngine({onLog:(e)=>{if(/lifecycle|error/i.test(e.level))console.log('LOG['+e.level+']',e.message);},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('STARTERR',e.message);}
await new Promise(r=>setTimeout(r,300));
const vm=eng.vm; const act=vm.activity;
console.log('activity=',act?.$runtimeClass?.descriptor,'mState d.l=',[...(act?.$fields||[])].filter(([k])=>k.endsWith('d;->l:Z')).map(([k,v])=>v));
console.log('children=', (function(){for(const [k,v] of act.$fields) if(k.endsWith('I:Landroidx/viewpager/widget/ViewPager;')) return v.$view.children.length;})());
