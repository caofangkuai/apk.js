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
if(clj&&clj.$fields){
  const b=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->b:Ljava/util/List;');
  console.log('depList=',b&&{desc:b.$descriptor,len:b.$peer?.items?.length});
  const c=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->c:Landroidx/coordinatorlayout/widget/a;');
  console.log('c=',c&&c.$descriptor, 'isJava=',!!(c&&c.$fields));
}
console.log('CL children=',cl&&cl.children.length, 'getChildCount=',cl&&cl.getChildCount&&cl.getChildCount());
for(const ch of (cl?.children||[])) console.log('  child',(ch.$descriptor||ch.$nativeClass||'').split('/').pop(), 'w=',ch.getWidth?.(),'h=',ch.getHeight?.(),'lp=',ch.layoutParams&&{w:ch.layoutParams.width,h:ch.layoutParams.height});
