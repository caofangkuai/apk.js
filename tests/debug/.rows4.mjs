process.on('uncaughtException', () => {});
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
await new Promise(r=>setTimeout(r,300));
const seen=new Set();
function txt(n){ const v=n.text!==undefined?n.text:(n.$fields&&n.$fields.get&&n.$fields.get('text'));
  if(v&&typeof v==='string'&&v.trim()) return v; return null; }
function walk(n){ if(!n||seen.has(n))return; seen.add(n);
  const t=txt(n); if(t) console.log(JSON.stringify(t));
  const kids=n.children||(n.child?[n.child]:[]);
  for(const c of kids) walk(c);
}
walk(eng.screen?.decorView);
