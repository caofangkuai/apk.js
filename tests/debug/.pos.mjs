import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx = new Proxy({measureText:t=>({width:String(t).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const logs=[];const engine=new EmulatorEngine({onLog:e=>{logs.push(e);if(e.level==='error')console.error('ERR',e.tag,e.message);},width:360,height:640});
engine.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
await engine.start(apk);
const vm=engine.vm;const peer=vm.registry.getPeer(engine.activity,vm.registry.classNameOf(engine.activity));
const root=peer.contentView;
function walk(v,d=0){console.log(' '.repeat(d),v.constructor.name,'@',v.left,v.top,v.getWidth()+'x'+v.getHeight(),v.getText?.()||'');for(const c of v.children||[])walk(c,d+2);}
walk(root);
console.log(logs.filter(e=>e.level==='error').length?'ERRORS':'OK');
for (const c of root.children) {
  const lp=c.layoutParams;
  console.log('  LP', c.getText?.(), 'keys=', lp && Object.keys(lp), 'x=', lp?.x, 'lpobj=', lp?.$layoutParams, 'fields=', lp?.$fields ? [...lp.$fields.keys()] : null);
}
