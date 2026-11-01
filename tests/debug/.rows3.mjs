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
await new Promise(r=>setTimeout(r,300));
const out=[];
function walk(n,path){ if(!n)return;
  if(n.getText){ const t=n.getText(); if(t) out.push(path+':'+String(t).replace(/\n/g,' ')); }
  const kids=n.children||(n.child?[n.child]:[]);
  kids.forEach((c,i)=>walk(c,path+'/'+i));
}
walk(eng.vm?.rootView||eng.rootView,'R');
console.log(out.join('\n'));
