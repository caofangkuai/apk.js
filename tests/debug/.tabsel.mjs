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
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,pred,acc=[]){if(!v)return acc;if(pred(v))acc.push(v);for(const c of v.children||[])find(c,pred,acc);return acc;}
const tl=find(dec,v=>(v.$nativeClass||v.$descriptor||'').includes('/tabs/TabLayout'))[0];
for(const tab of tl.children[0].children){
  const keys=tab.$fields?[...tab.$fields.keys()].map(k=>k.split('->').pop()):[];
  console.log('tab', JSON.stringify(keys), 'isSelected=',tab.isSelected, 'dexSel=',tab.$dexSelected, 'selectedProp=',tab.selected, 'vis=',tab.visibility);
}
