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
const texts=[];
function walk(n,d){ if(!n)return; if(typeof n.getText==='function'){const t=n.getText(); if(t)texts.push(t);} 
  if(Array.isArray(n.children)) for(const c of n.children) walk(c,d+1);
  else if(n.child) walk(n.child,d+1);
}
walk(eng.getRootView?eng.getRootView():eng.vm?.rootView,0);
console.log(texts.map(t=>String(t)).join(' | '));
