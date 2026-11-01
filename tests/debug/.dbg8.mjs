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
  const params = (desc.slice(1, desc.indexOf(')')).match(/\[?L[^;]+;|\[?[ZBIFJSDC]/g)||[]).map(p=>p);
  try{ return vm.invoke({classDesc:cls, name, proto:{descriptor:desc, parameters:params, returnType:desc.split(')')[1]}}, null, args, 'static'); }
  catch(e){ return 'ERR:'+e.message; }
}
function s(v){ if(v&&typeof v==='object'){ if(typeof v.$peer==='string') return v.$peer; if(v.$data) return '<arr>'; } return v; }
console.log('fd.f sda  =', st('Lf/a/d;','f','(Ljava/lang/String;)Z',['/sys/block/sda/device/model']));
console.log('fd.b sda  =', JSON.stringify(s(st('Lf/a/d;','b','(Ljava/lang/String;)Ljava/lang/String;',['/sys/block/sda/device/model']))));
console.log('fd.b2 sda =', JSON.stringify(s(st('Lf/a/d;','b','(Ljava/lang/String;Z)Ljava/lang/String;',['/sys/block/sda/device/model',true]))));
console.log('k0b.a(Z)  =', JSON.stringify(s(st('Lf/a/j/k0/b;','a','(Z)Ljava/lang/String;',[false]))));
console.log('k0b.b(Z)  =', JSON.stringify(s(st('Lf/a/j/k0/b;','b','(Z)Ljava/lang/String;',[false]))));
const st2 = vm._invokeStats || new Map();
console.log('STATS', [...st2.entries()].filter(([k])=>k.includes('io/FileReader')||k.includes('f/a/d;')).map(([k,v])=>k+':'+v).join(' '));
try {
  const fr = vm.newObject ? null : null;
  const obj = vm.allocateRawObject('Ljava/io/FileReader;');
  const rc = vm.registry.resolve('Ljava/io/FileReader;');
  vm.invoke({classDesc:'Ljava/io/FileReader;', name:'<init>', proto:{descriptor:'(Ljava/lang/String;)V', parameters:['Ljava/lang/String;'], returnType:'V'}}, obj, ['/sys/block/sda/device/model'], 'direct');
  console.log('FR text=', JSON.stringify(obj.$peer?.text?.slice(0,50)), 'path=', obj.$peer?.path);
} catch(e) { console.log('FR ERR', e.message); }
try {
  const fr = vm.allocateRawObject('Ljava/io/FileReader;');
  vm.invoke({classDesc:'Ljava/io/FileReader;', name:'<init>', proto:{descriptor:'(Ljava/lang/String;)V', parameters:['Ljava/lang/String;'], returnType:'V'}}, fr, ['/sys/block/sda/device/model'], 'direct');
  const br = vm.allocateRawObject('Ljava/io/BufferedReader;');
  vm.invoke({classDesc:'Ljava/io/BufferedReader;', name:'<init>', proto:{descriptor:'(Ljava/io/Reader;)V', parameters:['Ljava/io/Reader;'], returnType:'V'}}, br, [fr], 'direct');
  console.log('BR text=', JSON.stringify(br.$peer?.text?.slice(0,40)));
  const line = vm.invoke({classDesc:'Ljava/io/BufferedReader;', name:'readLine', proto:{descriptor:'()Ljava/lang/String;', parameters:[], returnType:'Ljava/lang/String;'}}, br, [], 'virtual');
  console.log('BR line=', JSON.stringify(line && typeof line==='object' ? line.$peer ?? '<obj>' : line));
} catch(e) { console.log('BR ERR', e.message); }
