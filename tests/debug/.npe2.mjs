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
const oS=eng.start.bind(eng);
eng.start=async function(a){
  const r=await oS(a);
  const vm=this.vm;
  const ot=vm.throwException.bind(vm);
  vm.throwException=function(cls,msg){
    const cm=this.interpreter?.currentMethod;
    if(String(msg).includes('isEmpty')) console.error('THROW_ISEMPTY at', cm? (cm.classDesc+'.'+cm.name+(cm.proto?cm.proto.descriptor:'')):'?', 'stack=', (this.methodStack||[]).slice(-6).join('<-'));
    return ot(cls,msg);
  };
  return r;
};
process.on('uncaughtException',e=>{ console.log('UNCAUGHT', e.message); process.exit(0); });
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,2000));
console.log('END');
