import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const Canvas=require('canvas');
import { EmulatorEngine, loadApkFiles } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
// scan all styles for attr 0x7f0402fd and 0x7f0402fc (tabTextColor)
for(const id of [2131099861,2131099865]){const e=t.entries?.get?.(id)||t.get?.(id);console.log('COLOR 0x'+id.toString(16),e?e.key+' '+JSON.stringify(e.value):'MISS');}
for(const [id,e] of t.entries||new Map()){
  if(e.typeName==='style' && e.bag){
    for(const [aid,val] of e.bag.items||[]){
      if(aid===0x7f0402fd||aid===0x7f0402fc){ console.log('style',id,e.key,'attr',aid.toString(16),JSON.stringify(val).slice(0,60)); }
    }
  }
}
