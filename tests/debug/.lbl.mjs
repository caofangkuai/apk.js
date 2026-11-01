import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;canvas.addEventListener=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,600));
const R=eng.vm.resources;
const ids=[2131820663,2131820864,2131820827,2131820585,2131820722,2131820731,2131820732,2131820955,2131820956,2131820576,2131820584,2131820740,2131820702,2131820856,2131820611,2131820734,2131820636,2131820829,2131820809,2131820595,2131820681,2131820817,2131820998,2131820695,2131820671,2131820896,2131820860,2131820877,2131820684,2131820687,2131820971,2131820642];
for(const id of ids){ let s; try{ s=R.getString(id);}catch(e){s='ERR';} console.log(id, JSON.stringify(s)); }
