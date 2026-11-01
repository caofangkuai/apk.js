globalThis.__LAY_DBG = 1;
globalThis.__LAY_NAT = 1;
globalThis.__LAY_CHUNK = 1;
globalThis.__MDBG = 1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);
canvas.style={}; canvas.clientWidth=360; canvas.clientHeight=720;
canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,500));
