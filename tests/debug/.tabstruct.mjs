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
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,pred,acc=[]){if(!v)return acc;if(pred(v))acc.push(v);for(const c of v.children||[])find(c,pred,acc);return acc;}
const tabs=find(dec,v=>(v.$nativeClass||v.$descriptor||'').includes('TabLayout'));
console.log('tablayouts',tabs.length);
for(const tl of tabs){
  console.log('TL desc', tl.$descriptor||tl.$nativeClass, 'bg', tl.background, 'tabBg', tl.$tabBackground,'ind',tl.$tabIndicatorColor,'sel',tl.$tabSelectedTextColor,'unsel',tl.$tabTextColor);
  for(const c of tl.children||[]){
    function c2(v){ if(v==null) return 'null'; if(typeof v==='object'&&v.color!==undefined) return '#'+v.color.toString(16); if(typeof v==='object'&&v.type) return v.type; return String(v); }
    function dump(v,d){ if(!v)return; const t=(v.$descriptor||v.$nativeClass||'?').split('/').pop(); const extra=v.text!==undefined?(' text="'+v.text+'"'):''; const tc=v.textColor!==undefined?(' tc='+v.textColor):''; console.log('  '.repeat(d)+t+' ['+v.left+','+v.top+'] '+v.measuredWidth+'x'+v.measuredHeight+' bg='+c2(v.background)+tc+extra); for(const k of v.children||[])dump(k,d+1);}
    dump(c,1);
  }
}
