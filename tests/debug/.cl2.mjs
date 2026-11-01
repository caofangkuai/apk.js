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
function find(v,name){if(!v)return null;const t=(v.$descriptor||v.$nativeClass||'').split('/').pop().replace(';','');if(t===name)return v;for(const c of v.children||[]){const r=find(c,name);if(r)return r;}return null;}
const cl=find(dec,'CoordinatorLayout');
const clj=cl&&(cl.$javaObject||cl);
const c=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->c:Landroidx/coordinatorlayout/widget/a;');
console.log('c desc=',c.$descriptor,'keys=',[...c.$fields.keys()]);
for(const [k,v] of c.$fields){console.log('  ',k,'=>',v&&typeof v==='object'?(v.$descriptor||'obj')+ ' len='+(v.$peer?.items?.length):v);}
const b=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->b:Ljava/util/List;');
console.log('b type=',typeof b, 'peer=',b&&b.$peer&&Object.keys(b.$peer), 'desc=',b&&b.$descriptor);
