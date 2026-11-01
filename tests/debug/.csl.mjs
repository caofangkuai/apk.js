import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const Canvas=require('canvas');
import { EmulatorEngine, loadApkFiles } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const cls=eng.vm.registry.resolve?.('Landroid/content/res/ColorStateList;');
console.log('resolved?', !!cls);
const o=eng.vm.allocateRawObject('Landroid/content/res/ColorStateList;');
console.log('o keys', Object.keys(o), 'peer', !!o.$peer, 'states', o.states, o.$peer?.states);
