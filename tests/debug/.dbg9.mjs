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
const p0 = vm.getStaticField({classDesc:'Lru/andr7e/deviceinfohw/j/w;', name:'p0', type:'Ljava/util/List;'});
const items = p0?.$data || p0?.items || [];
console.log('count', items.length);
items.forEach((it,i)=>{
  const fields = it?.$fields ? [...it.$fields].map(([k,v])=>k.split('/').pop()+': '+(typeof v==='string'?JSON.stringify(v.slice(0,30)):typeof v)) : [];
  console.log(i, fields.join(' | '));
});
console.log('p0 keys', p0 && Object.keys(p0));
console.log('p0 proto', p0 && Object.getPrototypeOf(p0)?.constructor?.name);
if (p0) console.log('p0 desc', p0.$descriptor, 'peer', p0.$peer, 'data', Array.isArray(p0.$data)?p0.$data.length:'no');
const peer = p0?.$peer;
console.log('peer keys', peer && Object.keys(peer));
const list = peer?.items ?? peer?.list ?? peer?.$items ?? peer?.data;
console.log('peer list len', list && list.length, Array.isArray(list));
if (Array.isArray(list)) list.slice(0,20).forEach((it,i)=>{
  const f = it?.$fields ? [...it.$fields].map(([k,v])=>k.split('/').pop()+'='+(typeof v==='string'?JSON.stringify(v.slice(0,24)):v)) : Object.keys(it||{});
  console.log('ITEM', i, f.join(' | '));
});
