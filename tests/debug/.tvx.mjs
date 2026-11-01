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
function find(v,pred,out=[]){if(!v)return out;if(pred(v))out.push(v);for(const c of v.children||[])find(c,pred,out);return out;}
const tvs=find(dec,v=>/TextView/.test(v.constructor?.name||''));
console.log('textviews', tvs.length);
for(const t of tvs.slice(0,12)){
  console.log(JSON.stringify(String(t.text).slice(0,24)), 'size='+t.textSize, 'color='+(typeof t.textColor==='number'?'0x'+(t.textColor>>>0).toString(16):t.textColor), 'meas='+t.measuredWidth+'x'+t.measuredHeight, 'pos=['+t.left+','+t.top+']');
}
