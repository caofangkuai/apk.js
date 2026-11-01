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
globalThis.__DBG_NPE_RV=1;
globalThis.__DBG_ASSET=1;
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));

const vmh=()=>eng.vm;
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
setTimeout(()=>{const vm=eng.vm; if(vm) console.log('STACK', (vm.methodStack||[]).slice(-10).join(' <- '));},1200);

try{ await new Promise(r=>setTimeout(r,2000)); }catch(e){ console.log('ASYNCFAIL', e.message, 'stack=', (eng.vm?.methodStack||[]).slice(-8).join('<-')); }

