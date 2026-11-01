import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,pred,out=[]){if(!v)return out;if(pred(v))out.push(v);for(const c of v.children||[])find(c,pred,out);return out;}
const rv=find(dec,v=>/RecyclerView/.test(v.$descriptor||''))[0];
console.log('RV',rv.left,rv.top,rv.getWidth?rv.getWidth():rv.right-rv.left,rv.getHeight?rv.getHeight():rv.bottom-rv.top,'kids',rv.children.length);
for(const r of rv.children){
  console.log(' row',r.constructor.name,'['+r.left+','+r.top+'] '+ (r.right-r.left)+'x'+(r.bottom-r.top), 'meas',r.measuredWidth,r.measuredHeight,'lp',r.layoutParams?.height,'pad',r.paddingTop,r.paddingBottom);
  for(const c of r.children) console.log('   cell',c.constructor.name,'['+c.left+','+c.top+'] '+(c.right-c.left)+'x'+(c.bottom-c.top),'meas',c.measuredWidth,c.measuredHeight,'ts',c.textSize,'text',JSON.stringify(String(c.text).slice(0,14)));
}
