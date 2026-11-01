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
const vm=eng.vm;
// find fragment instance
const dec=eng.screen?.decorView;
function find(v,pred,acc=[]){if(!v)return acc;if(pred(v))acc.push(v);for(const c of v.children||[])find(c,pred,acc);return acc;}
const rv=find(dec,v=>(v.$descriptor||v.$nativeClass||'').includes('RecyclerView'))[0];
const ad=rv?.$adapter||rv?.adapter;
console.log('adapter',ad&&(ad.$descriptor||ad.$nativeClass),'fields keys', ad?.$fields?[...ad.$fields.keys()].map(k=>k.split('->').pop()).join(','):'none');
// dump list field d/e
for(const [k,v] of (ad?.$fields||new Map())){
  if(k.includes('List')) console.log('LISTFIELD',k, v?.$data? v.$data.length : (Array.isArray(v)?v.length:typeof v));
}
