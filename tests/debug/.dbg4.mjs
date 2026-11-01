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
try{await eng.start(apk);}catch(e){}
const vm=eng.vm;
const seen=new Set();
const orig = vm.invoke.bind(vm);
vm.invoke = function(ref, receiver, args, mode, cur) {
  if (ref && ref.name==='a' && ref.classDesc==='Lru/andr7e/deviceinfohw/b;' && String(ref.proto?.descriptor||'').includes('deviceinfohw/f;')) {
    const f=args[1]; let label='?';
    for(const [k,v] of f?.$fields||[]) if(k.endsWith('name:Ljava/lang/String;')) label=v;
    const key=String(label);
    if(!seen.has(key)){ seen.add(key); console.log('BA', key, '=>', JSON.stringify(args[2])); }
  }
  return orig(ref, receiver, args, mode, cur);
};
