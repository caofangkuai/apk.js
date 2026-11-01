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
// hook invoke to trace b.a.k.a.a.d
const vm0=eng.vm;
const origInvoke = vm0.invoke.bind(vm0);
vm0.invoke = function(ref, receiver, args, mode, cm){
  const cname = ref?.classDesc || '';
  if(cname.includes('Lb/a/k/a/a;')) console.log('CALL b.a.k.a.a.'+ref.name+' mode='+mode+' argc='+(args?args.length:-1));
  return origInvoke(ref, receiver, args, mode, cm);
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
