import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx = new Proxy({measureText:t=>({width:String(t).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const engine=new EmulatorEngine({onLog:()=>{},width:360,height:640});
engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){}
const vm=engine.vm; const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
const cv=peer.contentView;
const ids={0x7f0900ce:'DrawerLayout',0x7f09022d:'Toolbar',0x7f090202:'TabLayout',0x7f0900a0:'ViewPager',0x7f090187:'NavigationView',0x7f090039:'act_content',0x7f09003b:'action_bar_root'};
const seen=new Set(); let n=0;
function walk(v,d){ if(!v||d>40||seen.has(v))return; seen.add(v); n++; const nm=ids[v.id]; if(nm) console.log('FOUND',nm,'0x'+(v.id>>>0).toString(16),v.constructor?.name); (v.children||[]).forEach(c=>walk(c,d+1)); }
walk(peer.window.decorView,0);
walk(cv,0);
console.log('total unique', n, 'seen size', seen.size);
