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
const q0 = vm.getStaticField({classDesc:'Lru/andr7e/deviceinfohw/j/w;', name:'q0', type:'J'});
console.log('w.q0 =', q0, typeof q0);
const pj = vm.getStaticField({classDesc:'Lf/a/j/p;', name:'g', type:'Ljava/lang/String;'});
console.log('p.g =', pj);
const pjj = vm.getStaticField({classDesc:'Lf/a/j/p;', name:'j', type:'J'});
console.log('p.j =', pjj);
const SYS = { classDesc:'Landroid/content/Context;', name:'getSystemService', proto:{descriptor:'(Ljava/lang/String;)Ljava/lang/Object;', parameters:['Ljava/lang/String;'], returnType:'Ljava/lang/Object;'} };
try {
  const am = vm.invoke({classDesc: vm.activity.$dexClass?.descriptor || 'Landroid/app/Activity;', name:'getSystemService', proto:{descriptor:'(Ljava/lang/String;)Ljava/lang/Object;', parameters:['Ljava/lang/String;'], returnType:'Ljava/lang/Object;'}}, vm.activity, ['activity'], 'virtual');
  console.log('AM obj =', am && (am.$peer ? 'peer' : am.$descriptor), am?.$peer ? Object.keys(am.$peer) : '');
  const mi = vm.instantiate('Landroid/app/ActivityManager$MemoryInfo;', []);
  vm.invoke({classDesc:'Landroid/app/ActivityManager;', name:'getMemoryInfo', proto:{descriptor:'(Landroid/app/ActivityManager$MemoryInfo;)V', parameters:['Landroid/app/ActivityManager$MemoryInfo;'], returnType:'V'}}, am, [mi], 'virtual');
  console.log('MI peer =', mi.$peer);
  console.log('MI totalMem field =', vm.getField(mi, {name:'totalMem', type:'J', classDesc:'Landroid/app/ActivityManager$MemoryInfo;'}));
} catch(e) { console.log('ERR', e.message); }
// 直接调 p.c
const mi = vm.instantiate('Landroid/app/ActivityManager$MemoryInfo;', []);
const r = vm.invoke({classDesc:'Lf/a/j/p;', name:'c', proto:{descriptor:'(Landroid/app/ActivityManager$MemoryInfo;)J', parameters:['Landroid/app/ActivityManager$MemoryInfo;'], returnType:'J'}}, null, [mi], 'static');
console.log('p.c(MI) =', r);
const r2 = vm.invoke({classDesc:'Lf/a/j/p;', name:'b', proto:{descriptor:'(J)Ljava/lang/String;', parameters:['J'], returnType:'Ljava/lang/String;'}}, null, [BigInt(4096)], 'static');
console.log('p.b(4096) =', JSON.stringify(r2 && typeof r2==='object' ? r2.$peer : r2));
const g = vm.invoke({classDesc:'Lf/a/g;', name:'a', proto:{descriptor:'(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;', parameters:['Ljava/lang/String;','Ljava/lang/String;'], returnType:'Ljava/lang/String;'}}, null, ['4','GB'], 'static');
console.log('g.a("4","GB") =', JSON.stringify(g && typeof g==='object' ? g.$peer : g));
