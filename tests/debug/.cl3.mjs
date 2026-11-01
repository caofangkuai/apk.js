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
const vm=eng.vm;
const dec=eng.screen.decorView;
function find(v,name){if(!v)return null;const t=(v.$descriptor||v.$nativeClass||'').split('/').pop().replace(';','');if(t===name)return v;for(const c of v.children||[]){const r=find(c,name);if(r)return r;}return null;}
const cl=find(dec,'CoordinatorLayout');
const clj=cl&&(cl.$javaObject||cl);
const c=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->c:Landroidx/coordinatorlayout/widget/a;');
const cJava=c.$peer?.$object||c;
console.log('cJava desc=',cJava.$descriptor, 'c peer keys=', c.$peer&&Object.keys(c.$peer));
const arr=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->a:Ljava/util/ArrayList;');
const aField=clj.$fields.get('Landroidx/coordinatorlayout/widget/a;->a:Lb/g/j/e;');
console.log('graph a nodes=', aField&&aField.$peer&&Object.keys(aField.$peer).slice(0,6));
// invoke c.b()
try{
const r=vm.invoke({classDesc:'Landroidx/coordinatorlayout/widget/a;',name:'b',proto:{descriptor:'()Ljava/util/ArrayList;',parameters:[],returnType:'Ljava/util/ArrayList;'}}, c, [], 'virtual');
console.log('c.b() ->', r&&(r.$descriptor||'obj'), 'peerKeys=', r&&r.$peer&&Object.keys(r.$peer), 'items=', r&&r.$peer&&r.$peer.items&&r.$peer.items.length);
}catch(e){console.log('c.b err',e.message);}
const bb=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->b:Ljava/util/List;');
console.log('b(now) items=', bb&&bb.$peer&&bb.$peer.items&&bb.$peer.items.length, 'peerKeys=',bb&&bb.$peer&&Object.keys(bb.$peer));
