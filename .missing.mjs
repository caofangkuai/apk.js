import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const JSZip=require('jszip');const {createCanvas}=require('canvas');
const {loadApkFiles,EmulatorEngine}=await import('./src/framework/engine.js');
const canvas=createCanvas(720,1520);canvas.style={};canvas.clientWidth=720;canvas.clientHeight=1520;canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};canvas.getBoundingClientRect=()=>({left:0,top:0,width:720,height:1520});
const logs=[];process.on('uncaughtException',()=>{});
const engine=new EmulatorEngine({width:720,height:1520,density:2,onLog:(e)=>logs.push(e.message||'')});engine.attachCanvas(canvas);
await engine.start(await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'))));
const screen=engine.screen;const end=Date.now()+2500;while(Date.now()<end){screen.dirty=true;screen.render();await new Promise(r=>setTimeout(r,16));}
const counts={};for(const line of logs){const m=String(line).match(/未绑定方法，返回默认值:\s*([^\s]+)/);if(m)counts[m[1]]=(counts[m[1]]||0)+1;}
console.log(logs.filter(l=>String(l).includes('未绑定')).slice(0,3)); console.log(Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10));
