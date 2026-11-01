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
try{await eng.start(apk);}catch(e){console.log('S',e.message);}
await new Promise(r=>setTimeout(r,800));
const V=eng.vm;
// find all objects whose runtime class is l/c
const seen=new Set(); const found=[];
function visit(o,depth){ if(!o||typeof o!=='object'||seen.has(o)||depth>4)return; seen.add(o);
  const cd=o.$runtimeClass?.descriptor||o.$nativeClass||o.$descriptor;
  if(cd==='Lru/andr7e/deviceinfohw/l/c;') found.push(o);
  for(const k of Object.keys(o)){ if(k.startsWith('$'))continue; try{visit(o[k],depth+1);}catch(e){} }
}
visit(V.rootView||V.decorView,0);
console.log('found l/c:', found.length);
for(const o of found.slice(0,2)){
  const flds=o.$fields instanceof Map? [...o.$fields.keys()] : Object.keys(o).filter(k=>!k.startsWith('$'));
  console.log('fields:', flds.join(','));
  const list=o.$fields instanceof Map? o.$fields.get('f') : o.f;
  console.log('list?', !!list, Array.isArray(list)? 'arr'+list.length : (list&&list.$elements? 'elems'+list.$elements.length : typeof list));
}
