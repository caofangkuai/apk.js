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
const origStart=eng.start.bind(eng);
eng.start=async function(a){
  const r=await origStart(a);
  const vm=this.vm;
  const oi=vm.invoke.bind(vm);
  vm.invoke=function(ref,receiver,args,mode,cm){
    const cd=ref?.classDesc;
    if(cd&&(cd.includes('deviceinfohw/l/b')||cd.includes('java/lang/Thread'))&&['e','b','a','start','run','f'].includes(ref.name) && cd.includes('deviceinfohw/l/b;')){
      console.error('TRACE '+cd+'.'+ref.name+((ref.proto&&ref.proto.descriptor)||''));
    }
    return oi(ref,receiver,args,mode,cm);
  };
  return r;
};
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,1500));
const dec=eng.screen?.decorView;
function find(v,pred,acc=[]){if(!v)return acc;if(pred(v))acc.push(v);for(const c of v.children||[])find(c,pred,acc);return acc;}
const rvs=find(dec,v=>(v.$descriptor||v.$nativeClass||'').includes('RecyclerView'));
for(const rv of rvs){ const ad=rv.$adapter||rv.adapter; console.log('RV itemCount=', rv.$itemCount, 'children=', rv.children?.length); }
