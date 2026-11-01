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
await new Promise(r=>setTimeout(r,600));
const V=eng.vm;
function call(cls,name,proto,args=[]){ try{ return V.invoke({classDesc:cls,name,proto:{descriptor:proto}},null,args,'static'); }catch(e){ return 'ERR:'+e.message; } }
const probes=[
 ['Lf/a/j/m;','a','()Ljava/util/List;'],
 ['Lf/a/j/n;','a','(Z)Ljava/util/List;'],
 ['Lf/a/j/j;','c','(Z)Ljava/util/ArrayList;'],
 ['Lf/a/j/k;','c','()Ljava/util/ArrayList;'],
 ['Lf/a/f;','i','()Z'],
 ['Lf/a/j/b0;','h','()Ljava/lang/String;'],['Lf/a/j/b0;','k','()Ljava/lang/String;'],['Lf/a/j/b0;','l','()Ljava/lang/String;'],
];
for(const [c,n,p] of probes){ const args = p.startsWith('(Z)') ? [false] : []; const r=call(c,n,p,args); let d=r; try{ if(r&&r.$peer&&r.$peer.items) d='List['+r.$peer.items.length+']'; else if(r&&r.$data&&Array.isArray(r.$data)) d='Arr['+r.$data.length+']'; else if(Array.isArray(r)) d='arr['+r.length+']'; }catch(e){} console.log(c.split('/').pop()+'.'+n, '=>', typeof r==="string"?r:String(d)); }
