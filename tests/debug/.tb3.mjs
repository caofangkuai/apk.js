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
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,500));
const vm=eng.vm;
const dec=eng.screen?.decorView;
function find(v,pred,out=[]){if(!v)return out;if(pred(v))out.push(v);for(const c of v.children||[])find(c,pred,out);return out;}
const tb=find(dec,v=>/Toolbar/.test(v.$descriptor||''))[0];
console.log('tb meas',tb.measuredWidth,tb.measuredHeight);
// call dex onMeasure manually with EXACTLY specs
const origErr=console.error; console.error=(...a)=>origErr('ERR>',...a);
const o=tb.$javaObject;
try{
  const r=vm.invoke({classDesc:'Landroidx/appcompat/widget/Toolbar;',name:'onMeasure',proto:{descriptor:'(II)V',parameterTypes:[]}},o,[(1073741824)|720,(1073741824)|112],'virtual');
  console.log('dex onMeasure ok ->', tb.measuredWidth, tb.measuredHeight);
}catch(e){console.log('dex onMeasure ERR', e.message);}
console.error=origErr;
const img=tb.children[0];
{const d=img.drawable;console.log('IMG lp', JSON.stringify(img.layoutParams), 'drawable', JSON.stringify(d && {type:d.type, xmlName:d.xml?.name, nAttrs:(d.xml?.attrs||[]).length, attrNames:(d.xml?.attrs||[]).map(a=>a.name).join('|')}));}
try{img.measure(0x80000000|0,0x80000000|0);console.log('IMG measure ->',img.measuredWidth,img.measuredHeight);}catch(e){console.log('IMG measure ERR',e.message);}
for(const c of tb.children) {
  console.log(' child',c.constructor.name,'meas',c.measuredWidth,c.measuredHeight,'lp',c.layoutParams?'Y':'N','vis',c.visibility,'hasJO',!!c.$javaObject,'$view===c',c.$javaObject?.$view===c);
  const jo=c.$javaObject;
  if(jo){const own=Object.getOwnPropertySymbols(jo).map(sym=>[sym.toString(),jo[sym]]);console.log('   JO meta',JSON.stringify(own.slice(0,3)).slice(0,120));}
}
