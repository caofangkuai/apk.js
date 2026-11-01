import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
globalThis.__DBG_FR_OPEN=1;
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,900));
const V=eng.vm;
const st=V._invokeStats||new Map();
const arr=[...st.entries()].filter(([k])=>/FileReader|BufferedReader|m0\.c|g0\.|k0\./.test(k));
console.log(arr.map(([k,v])=>k.replace('Lf/a/j/','')+'='+v).join('\n') || 'NONE');
