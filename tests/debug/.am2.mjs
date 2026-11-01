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
await new Promise(r=>setTimeout(r,100));
const vm=eng.vm;
const am=vm.resources.getAssets();
console.log('readBytes?', typeof am?.readBytes);
const raw = am?.readBytes?.('x');
console.log('raw', raw?.length);
const st = vm.allocateRawObject('Ljava/io/FileInputStream;');
console.log('alloc stream', !!st, st && st.$descriptor);
vm.registry.getPeer; 
if(st){const p=vm.registry.getPeer(st,'Ljava/io/FileInputStream;'); console.log('peer', !!p, p&&Object.keys(p).slice(0,5));}
