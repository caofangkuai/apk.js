import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,pred,out=[]){if(!v)return out;if(pred(v))out.push(v);for(const c of v.children||[])find(c,pred,out);return out;}
const tl=find(dec,v=>/TabLayout/.test(v.$descriptor||''))[0];
const c=tl.children[0];
for(const t of (c?.children||[]).slice(0,8)){
  const tvs=[]; (function w(x){if(/TextView/.test(x.constructor?.name||''))tvs.push(x);for(const k of x.children||[])w(k);})(t);
  console.log('tab@'+t.left, tvs.map(x=>JSON.stringify(String(x.text))).join(','), 'vis='+t.visibility);
}
