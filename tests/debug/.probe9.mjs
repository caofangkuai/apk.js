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
const dec=peer.window.decorView;
const ids={0x7f0900ce:'DrawerLayout',0x7f09022d:'Toolbar',0x7f090202:'TabLayout',0x7f0900a0:'ViewPager',0x7f090187:'NavigationView',0x7f090039:'activity_content',0x7f09003b:'action_bar_root'};
let n=0;
function walk(v,d){ if(!v||d>30)return; n++; const nm=ids[v.id]||''; if(nm) console.log('FOUND',nm,'0x'+(v.id>>>0).toString(16),v.constructor?.name,'desc',v.$descriptor,'depth',d); (v.children||[]).forEach(c=>walk(c,d+1)); }
console.log('decor children', dec.children.length, 'contentHost children', dec.contentHost?.children?.length);
walk(dec,0);
console.log('total nodes', n);
console.log('contentFrame exists', !!dec.contentFrame, 'id', dec.contentFrame?.id, 'parent', dec.contentFrame?.parent?.id, dec.contentFrame?.parent?.constructor?.name);
console.log('contentHost.parent', dec.contentHost?.parent?.id);
console.log('vm.__contentFrame set', !!vm.__contentFrame, 'sameAsDecor', vm.__contentFrame===dec.contentFrame);
