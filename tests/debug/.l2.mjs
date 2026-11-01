globalThis.__LAYD=1;
globalThis.__RVD=1;
process.env.DBG_EXC='1';
globalThis.__LAY_CHUNK = 1;
globalThis.__MDBG = 1;
globalThis.__INITD = 1;
globalThis.__TRMEAS = 1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);
canvas.style={}; canvas.clientWidth=360; canvas.clientHeight=720;
canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,500));

console.error('TL_TOP_HISTORY ' + JSON.stringify(globalThis.__TL||[]));
if (false) {}
if (globalThis.__RVREF) { for (const c of globalThis.__RVREF.children) console.error('RVCHILD top=' + c.top + ' h=' + (c.bottom-c.top) + ' kids=' + (c.children||[]).length); }
