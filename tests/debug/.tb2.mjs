import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);canvas.style={};canvas.clientWidth=360;canvas.clientHeight=720;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const vm=eng.vm;
for(const nm of ['onMeasure','onLayout']){
  let r;try{r=vm.findVirtual('Landroidx/appcompat/widget/Toolbar;',nm,'(II)V');}catch(e){r=null}
  console.log(nm,'->',r?r.kind+':'+(r.method?.proto||r.method?.name):'null');
}
let r2;try{r2=vm.findVirtual('Landroidx/appcompat/widget/Toolbar;','onLayout','(ZIIII)V');}catch(e){}
console.log('onLayout Z','->',r2?r2.kind:'null');
