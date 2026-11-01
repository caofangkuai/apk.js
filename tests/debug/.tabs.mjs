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
const vm=eng.vm; const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
const dec=peer.window.decorView;
function find(v,id){ if(!v)return null; if((v.id>>>0)===id)return v; for(const c of v.children||[]){const f=find(c,id);if(f)return f;} return null;}
const tl=find(dec,0x7f090202);
console.log('TabLayout class=', tl.constructor.name, 'children=', tl.children?.length, 'vis=', tl.visibility, 'size=',tl.getWidth(),tl.getHeight());
if(tl.children) tl.children.forEach((c,i)=>console.log(' tab',i,c.constructor.name,'vis',c.visibility,'text',c.children?.map(x=>x.text||x.constructor.name).join(',')||c.text));
const vp=find(dec,0x7f0900a0);
console.log('ViewPager adapter=', !!vp?.adapter, 'pages=', vp?.adapter?.getCount?.() );
