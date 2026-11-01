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
const vm0=eng.vm;
const oi = vm0.invoke.bind(vm0);
let seen=new Set();
vm0.invoke = function(ref, receiver, args, mode, cm){
  const cd = ref && (ref.classDesc || ref.cls || ref.owner);
  if(cd && String(cd).includes('y/c') && ref.name==='a'){ const k=String(cd)+'.'+ref.name; if(!seen.has(k)){seen.add(k);console.log('HIT', k, 'desc=', ref.proto&&ref.proto.descriptor);} }
  return oi(ref, receiver, args, mode, cm);
};
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
