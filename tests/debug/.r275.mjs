globalThis.PRE_RENDER_DUMP=1;
globalThis.__STX=1;
globalThis.__TXT=1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const W=720, H=1520;
const canvas=Canvas.createCanvas(W,H);
canvas.style={}; canvas.clientWidth=W; canvas.clientHeight=H;
canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H});
const eng=new EmulatorEngine({onLog:()=>{},width:W,height:H,density:2.75});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const vm=eng.vm; const act=vm.activity;
function fld(o,sfx){ if(!o||!o.$fields)return undefined; for(const [k,v] of o.$fields) if(k.endsWith(sfx)) return v; return undefined; }
const win=fld(act,'mWindow:Landroid/view/Window;');
const dec=eng.screen?.decorView || (win&&fld(win,'mDecor:Landroid/view/View;'));
console.log('actClass=',act.$dexClass&&act.$dexClass.descriptor,'hasDecor=',!!dec);
if(dec){function dump(v,d){if(!v)return;const t=(v.$descriptor||v.$nativeClass||'?').split('/').pop().replace(';','');const k=v.children||[];console.log('  '.repeat(d)+t+' ch='+k.length);for(const c of k)dump(c,d+1);}dump(dec,0);}
function pd(v,d){if(!v)return;const t=(v.$descriptor||v.$nativeClass||'?').split('/').pop().replace(';','');console.log('PRE '+('  '.repeat(d))+t+' ['+v.left+','+v.top+'] '+v.measuredWidth+'x'+v.measuredHeight);for(const c of v.children||[])pd(c,d+1);}
if(globalThis.PRE_RENDER_DUMP&&dec)pd(dec,0);
try{ vm.renderToCanvas?.(canvas); }catch(e){console.log('RENDERERR',e.message);}
fs.writeFileSync('/tmp/out.png', canvas.toBuffer('image/png'));
console.log('wrote /tmp/out.png');
console.log('screen.decorView=', !!eng.screen?.decorView, 'eng.activity=', eng.activity?.$dexClass?.descriptor);
if(eng.screen?.decorView){function d2(v,d){if(!v)return;const t=(v.$descriptor||v.$nativeClass||'?').split('/').pop().replace(';','');const k=v.children||[];console.log('  '.repeat(d)+t+' ch='+k.length);for(const c of k)d2(c,d+1);}d2(eng.screen.decorView,0);}
eng.screen.dirty=true; eng.screen.render();
fs.writeFileSync('/tmp/out.png', canvas.toBuffer('image/png'));
console.log('rendered & saved');
