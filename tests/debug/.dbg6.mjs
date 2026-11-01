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
  try{
    const params = (desc.slice(1, desc.indexOf(')')).match(/\[?L[^;]+;|\[?[ZBIFJSDC]/g)||[]);
    const r = vm.invoke({classDesc:cls, name, proto:{descriptor:desc, parameters:params}}, null, args, 'static');
    return r;
  }catch(e){ return 'ERR:'+e.message; }
}
const probes=[
 ['Lf/a/j/k0/b;','d','()Ljava/lang/String;'],
 ['Lf/a/j/k0/b;','b','(Z)Ljava/lang/String;',[false]],
 ['Lf/a/j/k0/b;','a','(Z)Ljava/lang/String;',[false]],
 ['Lf/a/j/m0/b;','b','()Ljava/lang/String;'],
 ['Lf/a/j/m0/b;','a','()Ljava/lang/String;'],
 ['Lf/a/j/m0/c;','a','()Ljava/lang/String;'],
 ['Lf/a/j/m0/c;','b','()Ljava/lang/String;'],
 ['Lf/a/j/p;','a','(JZ)Ljava/lang/String;',[4000000000,false]],
 ['Lf/a/j/p;','a','(J)Ljava/lang/String;',[4000000000]],
 ['Lf/a/j/i;','a','()Ljava/lang/String;'],
 ['Lf/a/j/i;','b','(Z)Ljava/lang/String;',[false]],
];
for(const [c,n,d,a=[]] of probes){
  const r=st(c,n,d,a);
  let out=r;
  if(r && typeof r==='object') {
    if (typeof r.$peer === 'string') out = r.$peer;
    else if (r.$data) out = '<arr '+r.$data.length+'>';
    else if (r.$fields) { const f=[...r.$fields].map(([k,v])=>k+'='+(typeof v==='string'?v:v)); out = f.join(','); }
    else out = '<obj '+Object.keys(r).slice(0,4).join(',')+'>';
  }
  console.log('P', c.split('/').slice(-2).join('/'), n+d, '=>', typeof out==='string'? JSON.stringify(out.slice(0,60)) : `<${typeof out}>`);
}
