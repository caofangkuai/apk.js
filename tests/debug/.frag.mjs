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
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,1500));
const dec=eng.screen?.decorView;
function find(v,pred,acc=[]){if(!v)return acc;if(pred(v))acc.push(v);for(const c of v.children||[])find(c,pred,acc);return acc;}
const rv=find(dec,v=>(v.$descriptor||v.$nativeClass||'').includes('RecyclerView'))[0];
if(rv){
  console.log('RV desc',rv.$descriptor, 'adapter desc', rv.$adapter?.$descriptor||rv.adapter?.$descriptor, 'adapterClass', rv.$adapter?.$dexClass?.descriptor||rv.adapter?.$dexClass?.descriptor);
  console.log('items', rv.children?.length);
  for(const c of rv.children||[]){
    function txt(v,acc=[]){ if(v.text) acc.push(String(v.text).slice(0,30)); for(const k of v.children||[])txt(k,acc); return acc; }
    console.log(JSON.stringify(txt(c)));
  }
}
