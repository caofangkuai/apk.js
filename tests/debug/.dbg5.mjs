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
const rc=vm.registry.resolve('Lru/andr7e/deviceinfohw/j/w;');
const p0=vm.getStatic(rc.dexClass, {name:'p0', type:'Ljava/util/List;', classDesc:'Lru/andr7e/deviceinfohw/j/w;'});
console.log('p0 type', typeof p0, Array.isArray(p0), p0?.$data?.length, p0?.items?.length);
const arr = p0?.$data || p0?.items || (Array.isArray(p0) ? p0 : []);
console.log('len', arr.length);
for (let i=0;i<arr.length;i++){
  const it=arr[i];
  let lbl='?', val=null;
  for(const [k,v] of it?.$fields||[]){ if(String(k).includes('b:I')) lbl=k; if(String(k).includes('c:Ljava/lang/String;')) val=v; if(String(k).includes('d:Ljava/lang/String;')) lbl=v; }
  console.log(i, JSON.stringify([...(it?.$fields||[])].map(([k,v])=>[k.slice(-24), typeof v==='string'?v.slice(0,40):v])));
}
