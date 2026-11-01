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
// set mCurItem=0
for(const [k] of I.$fields){ if(k.endsWith('->h:I')) I.$fields.set(k,0); }
console.log('set mCurItem=0');
try{ vm.invoke({classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'e',proto:{descriptor:'()V',parameters:[],returnType:'V'}},I,[],'virtual'); console.log('populate OK'); }catch(e){ console.log('populate ERR', e.message); }
// also setCurrentItem(0)
try{ const cm=I.$dexClass.directMethods.find(m=>m.name==='a'&&m.proto.descriptor==='(IZ)V')||I.$dexClass.virtualMethods?.find(m=>m.name==='setCurrentItem'); if(cm){vm.executeMethod(cm,I,[0,true]);console.log('setCurrentItem OK');} }catch(e){console.log('setCurrentItem ERR',e.message);}
const vpView=I.$view;
console.log('ViewPager children after=', vpView?.children?.length);
for(const [k,v] of I.$fields){ if(k.endsWith('->h:I')) console.log('mCurItem now=',v); if(k.endsWith('->c:Ljava/util/ArrayList;')) console.log('mItems native=', v?.$list?.length ?? v?.$data?.length ?? v?.items?.length ?? 'n/a'); }
