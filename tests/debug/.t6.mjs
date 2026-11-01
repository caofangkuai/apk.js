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
const origStart=eng.start.bind(eng);
eng.start=async function(a){
  const r=await origStart(a);
  const vm=this.vm;
  const oi=vm.invoke.bind(vm);
  globalThis.__hits=new Map();
  vm.invoke=function(ref,receiver,args,mode,cm){
    const cd=ref?.classDesc;
    if(cd&&cd.includes('deviceinfohw/l/b;')){ const k=cd+'.'+ref.name+(ref.proto?ref.proto.descriptor:''); globalThis.__hits.set(k,(globalThis.__hits.get(k)||0)+1); }
    return oi(ref,receiver,args,mode,cm);
  };
  return r;
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,1500));
for(const [k,v] of (globalThis.__hits||new Map())) console.log(v,k);
