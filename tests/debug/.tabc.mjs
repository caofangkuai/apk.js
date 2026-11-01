import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const Canvas=require('canvas');
import { EmulatorEngine, loadApkFiles } from './src/framework/engine.js';
const W=720,H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={};canvas.clientWidth=W;canvas.clientHeight=H;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
globalThis.__GCFS=1;globalThis.__CSLDBG=1;globalThis.__SGDBG=1;const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const dec=eng.screen?.decorView;
function find(v,name){if(!v)return null;const d=v.$descriptor||v.$nativeClass||'';if(d.includes(name))return v;for(const c of v.children||[]){const r=find(c,name);if(r)return r;}return null;}
const tl=find(dec,'TabLayout');
{const r=eng.vm.registry.resolve('Lc/a/a/a/z/b;');console.log('B f', JSON.stringify(r?.staticValues?.get('f:[I')?.$data), 'b', JSON.stringify(r?.staticValues?.get('b:[I')?.$data), 'g', JSON.stringify(r?.staticValues?.get('g:[I')?.$data));}
{const j=tl.$javaObject?.$fields?.get('Lcom/google/android/material/tabs/TabLayout;->j:Landroid/content/res/ColorStateList;');
 console.log('J statesVals', JSON.stringify((j?.states||[]).map(x=>x?.$data||x)), 'colors', JSON.stringify(j?.colors), 'peerC', JSON.stringify(j?.$peer?.colors), 'peerS', JSON.stringify((j?.$peer?.states||[]).map(x=>x?.$data||x)));}
const content=tl.children[0];
const tabs=content.children;
for(let i=0;i<3;i++){
  const tab=tabs[i];
  const tv=tab.children.find(c=>c.text!==undefined);
  if(i===0){const csl=tv?.$textColorStateList;console.log('CSLRAW states', csl?.states, 'colors', JSON.stringify(csl?.colors), 'peerStates', csl?.$peer?.states, 'peerColors', JSON.stringify(csl?.$peer?.colors));}
  console.log('tab'+i, 'csl', tv?.$textColorStateList ? {states:tv.$textColorStateList.states?.length, colors:tv.$textColorStateList.colors} : 'none', 'isSelected', tab.isSelected?.(), 'text', JSON.stringify(tv?.text), 'color', tv?.textColor, 'cslColor', tv?.textColorStateList?.color ?? tv?.$textColorStateList?.color);
}
