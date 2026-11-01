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
  vm.invoke=function(ref,receiver,args,mode,cm){
    globalThis.__HC=(globalThis.__HC||0)+1;
    const res=oi(ref,receiver,args,mode,cm);
    try{
      const cd=ref?.classDesc;
      if(cd==='Lru/andr7e/deviceinfohw/b;'){
        const d=ref.proto&&ref.proto.descriptor||'';
        const v=args&&args[args.length-1];
        console.log('B_CALL', ref.name, d, 'last=' + (v===null||v===undefined?'NULL':(typeof v==='string'?JSON.stringify(v):typeof v)));
      }
    }catch(e){}
    return res;
  };
  return r;
};
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,1500));
console.log('END HC=' + globalThis.__HC);
const V=eng.vm;
console.log('STAT_b', [...(V._invokeStats||new Map()).entries()].filter(([k])=>k.includes('deviceinfohw.b.')).slice(0,12).map(([k,v])=>k+'='+v).join(' , '));
console.log('STAT_we', [...(V._invokeStats||new Map()).entries()].filter(([k])=>k.includes('/j/w.')).slice(0,12).map(([k,v])=>k+'='+v).join(' , '));
