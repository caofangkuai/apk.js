import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const ctx = new Proxy({measureText:t=>({width:String(t).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:640,width:360,height:640,style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:640}}};
const logs=[];process.on('SIGINT',()=>{const vm=engine.vm;console.error('SIGINT STACK:',(vm?.methodStack||[]).slice(-20).join(' <- '));console.error('steps',globalThis.__steps,'inv',vm?.invocationCount);process.exit(0);});
const engine=new EmulatorEngine({onLog:e=>{logs.push(e);console.log('LOG',e.level,e.tag,e.message);},width:360,height:640});
engine.attachCanvas(canvas);
Object.defineProperty(globalThis,'__vm',{get(){return engine.vm;}});
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){console.log('START ERR',e.message);const je=e.javaException;if(je){console.log("EXC",engine.vm?.registry?.classNameOf(je),'msg=',je.$exceptionMessage,"stack=",(engine.vm?.methodStack||[]).slice(-8).join(" <- "));}const c=je?.$savedException||je?.$cause;if(c)console.log("CAUSE",engine.vm?.registry?.classNameOf(c),c.$exceptionMessage);}
const vm=engine.vm;
console.log('engine.activity desc', vm?.registry?.classNameOf(engine.activity), 'vm.activity', vm?.registry?.classNameOf(vm.activity));
const act = vm.activity || engine.activity; const peer=vm.registry.getPeer(act, vm.registry.classNameOf(act));
console.log('peer ctor', peer?.constructor?.name, 'contentView', peer?.contentView?.constructor?.name);
function dump(v, d=0){ if(!v||d>14) return; console.log('  '.repeat(d)+ (v.constructor?.name||v.$descriptor||'?') + (v.text?` "${v.text}"`:'') + (v.id!=null?` id=${v.id}`:'')); const kids=v.children||[]; for(const c of kids) dump(c,d+1); }
dump(peer?.contentView);
