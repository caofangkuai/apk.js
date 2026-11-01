import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720); canvas.style={}; canvas.clientWidth=360; canvas.clientHeight=720; canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{}; canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,400));
const dec=eng.screen.decorView;
function b(v){return v?`[${v.left},${v.top},${v.right},${v.bottom} w=${v.getWidth?.()} h=${v.getHeight?.()}]`:'-';}
function dump(v,d){if(!v)return;const t=(v.$descriptor||v.$nativeClass||'?').split('/').pop().replace(';','');const k=v.children||[];console.log('  '.repeat(d)+t+' '+b(v)+' vis='+v.visibility+' ch='+k.length);for(const c of k)dump(c,d+1);}
console.log('decor',b(dec));
dump(dec,0);
