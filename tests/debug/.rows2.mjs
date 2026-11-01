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
try{await eng.start(apk);}catch(e){console.log('S',e.message);}
await new Promise(r=>setTimeout(r,300));
let rv=null;
function walk(n){ if(!n)return; const dn=n.$descriptor||n.constructor?.name; if(String(dn).includes('RecyclerView')&&!rv) rv=n;
  if(Array.isArray(n.children)) for(const c of n.children) walk(c); }
walk(eng.vm?.rootView||eng.rootView);
if(!rv){console.log('no rv');process.exit(0);}
for(const row of rv.children){
  const cells=[];
  for(const c of (row.children||[])){
    let tv=c;
    if(c.children&&c.children.length) tv=c.children[0];
    const t=tv.getText?tv.getText():null;
    cells.push(String(t));
  }
  console.log(cells.join(' = '));
}
