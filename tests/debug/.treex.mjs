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
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function dump(v,d){if(!v)return;const n=(v.$descriptor||'?').split('/').pop().replace(';','');
console.log('  '.repeat(d)+n+' ['+v.left+','+v.top+'] '+(v.right-v.left)+'x'+(v.bottom-v.top)+' vis='+v.visibility+(v.bgColor?' bg':''));
for(const c of v.children||[])dump(c,d+1);}
dump(dec,0);
