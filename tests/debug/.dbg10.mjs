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
function st(cls,name,desc,args=[]){
  const params = (desc.slice(1, desc.indexOf(')')).match(/\[?L[^;]+;|\[?[ZBIFJSDC]/g)||[]);
  try{ return vm.invoke({classDesc:cls, name, proto:{descriptor:desc, parameters:params, returnType:desc.split(')')[1]}}, null, args, 'static'); }
  catch(e){ return 'ERR:'+e.message; }
}
function s(v){ if(v&&typeof v==='object'){ if(typeof v.$peer==='string') return v.$peer; } return v; }
console.log('p.b(4096) =', JSON.stringify(s(st('Lf/a/j/p;','b','(J)Ljava/lang/String;',[4000000000]))));
console.log('p.e(false)      =', JSON.stringify(s(st('Lf/a/j/p;','e','(Z)Ljava/lang/String;',[false]))));
console.log('p.d()           =', JSON.stringify(s(st('Lf/a/j/p;','d','()Ljava/lang/String;',[]))));
console.log('p.c(MemInfo)    =', '(skip)');
console.log('p.a(Context,Z)  =', '(skip)');
