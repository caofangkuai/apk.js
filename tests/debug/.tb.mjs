import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(720,1520);canvas.style={};canvas.clientWidth=720;canvas.clientHeight=1520;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:1520,density:2});
const eng=new EmulatorEngine({onLog:()=>{},width:720,height:1520,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,pred){if(!v)return null;if(pred(v))return v;for(const c of v.children||[]){const r=find(c,pred);if(r)return r;}return null;}
const tb=find(dec,v=>/Toolbar/.test(v.$descriptor||'')&&/Toolbar/.test(v.constructor?.name||''));
console.log('tb',tb?.$descriptor, 'measured',tb?.measuredWidth,tb?.measuredHeight, 'vis',tb?.visibility);
for(const c of tb?.children||[]){
  let lpdesc=null; try{lpdesc=c.layoutParams?.['$descriptor']}catch{}
  console.log(' child', c.constructor?.name, 'lpW='+(c.layoutParams?.width)+' lpH='+(c.layoutParams?.height)+' lpD='+(c.layoutParams?.['$descriptor']||'-'), 'meas',c.measuredWidth,c.measuredHeight,'vis',c.visibility);
}
