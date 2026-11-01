import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createCanvas } = require('canvas');
const JSZip = require('jszip');
import { EmulatorEngine, loadApkFiles } from './dist/android-framework.min.js';
const W=360,H=720;
const canvasEl = createCanvas(W,H);
canvasEl.clientWidth=W;canvasEl.clientHeight=H;canvasEl.style={};
canvasEl.addEventListener=()=>{};canvasEl.removeEventListener=()=>{};
canvasEl.setPointerCapture=()=>{};canvasEl.releasePointerCapture=()=>{};
canvasEl.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
globalThis.requestAnimationFrame=(cb)=>setTimeout(()=>cb(Date.now()),16);
const engine=new EmulatorEngine({onLog:()=>{},width:W,height:H,dpr:1});engine.attachCanvas(canvasEl);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await engine.start(apk);}catch(e){console.error('START',e.message);}
const vm=engine.vm; const peer=vm.registry.getPeer(vm.activity,vm.registry.classNameOf(vm.activity));
const dec=peer?.window?.decorView;
console.log('decor.contentView=', dec?.contentView?.constructor?.name+'#'+((dec?.contentView?.id??0)>>>0).toString(16));
console.log('decor.children=', (dec?.children||[]).map(c=>c.constructor?.name+'#'+((c.id??0)>>>0).toString(16)).join(', '));
console.log('screen.decorView === dec ?', engine.screen?.decorView===dec);
console.log('dec size=', dec?.getWidth?.(), dec?.getHeight?.(), 'measured', dec?.getMeasuredWidth?.(), dec?.getMeasuredHeight?.());
// walk with geometry
function w(v,d){ if(!v||d>8)return; const lp=v.layoutParams||{}; console.log('  '.repeat(d)+v.constructor?.name+' id='+((v.id??0)>>>0).toString(16)+' vis='+v.visibility+' ltrb='+[v.left,v.top,v.right,v.bottom]+' m='+[v.getMeasuredWidth?.(),v.getMeasuredHeight?.()]+(v.text!=null?' text="'+v.text+'"':'')); (v.children||[]).forEach(c=>w(c,d+1)); }
w(dec,0);
