import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const Canvas=require('canvas');
import { EmulatorEngine, loadApkFiles } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
const vm=eng.vm;
const rc=vm.registry.resolve('Landroid/content/res/ColorStateList;');
console.log('rc.nativeDef?', !!rc?.nativeDef, 'ctor?', !!rc?.nativeDef?.ctor, 'methods', rc?.nativeDef?.methods?.size);
const o=vm.allocateRawObject('Landroid/content/res/ColorStateList;');
const peer=vm.registry.getPeer(o,'Landroid/content/res/ColorStateList;');
console.log('peer keys', Object.keys(peer).slice(0,6), 'states', peer.states);
