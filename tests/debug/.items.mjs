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
try{await eng.start(apk);}catch(e){console.log('S',e.message);}
await new Promise(r=>setTimeout(r,400));
const vm=eng.vm;
const cls=vm.registry?.resolve?.('Lru/andr7e/deviceinfohw/j/w;');
console.log('cls?', !!cls);
// try call static-ish method via interpreter
try{
  const r=vm.invokeStatic? vm.invokeStatic('Lru/andr7e/deviceinfohw/j/w;','e','(I)Ljava/util/List;',[0]) : 'no invokeStatic';
  console.log('ret', r);
}catch(e){console.log('EI', e.message);}
