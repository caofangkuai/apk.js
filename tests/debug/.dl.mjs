import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const Canvas = require('canvas');
import { EmulatorEngine, loadApkFiles } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,name){if(!v)return null;const d=v.$descriptor||v.$nativeClass||'';if(d.includes(name))return v;for(const c of v.children||[]){const r=find(c,name);if(r)return r;}return null;}
const dl=find(dec,'DrawerLayout');
console.log('DL found', !!dl);
for(const c of dl.children||[]){
  console.log(c.$descriptor||c.$nativeClass, 'lp', JSON.stringify(c.layoutParams), 'vis', c.visibility, 'meas', c.measuredWidth+'x'+c.measuredHeight, 'pos', c.left+','+c.top);
}
