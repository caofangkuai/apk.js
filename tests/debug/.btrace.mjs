import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
const oS=eng.start.bind(eng);
eng.start=async function(a){
  const r=await oS(a);
  const vm=this.vm;
  const oi=vm.invoke.bind(vm);
  let n=0;
  vm.invoke=function(ref,receiver,args,mode,cm){
    if(ref?.classDesc==='Lru/andr7e/deviceinfohw/b;'&&ref.name==='a'&&ref.proto?.descriptor==='(Ljava/util/List;Lru/andr7e/deviceinfohw/f;Ljava/lang/String;)V'){
      const label=args[1]?.$dexEnumName || args[1]?.name || args[1]?.$fields?.get?.('name') || '?';
      const val=args[2]; const s=typeof val==='string'?val:(val?.$data?val.$data.join(''):String(val));
      if(n++<60) console.error('ADD label='+label+' val='+JSON.stringify(s).slice(0,50));
    }
    return oi(ref,receiver,args,mode,cm);
  };
  return r;
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,1500));
