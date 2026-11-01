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
const clj=cl.$javaObject||cl;
// manually invoke e()
vm.invoke({classDesc:'Landroidx/coordinatorlayout/widget/CoordinatorLayout;',name:'e',proto:{descriptor:'()V',parameters:[],returnType:'V'}}, clj, [], 'virtual');
const bb=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->b:Ljava/util/List;');
console.log('after manual e(): b items=', bb.$peer.items.length);
// now measure
import {MeasureSpec} from './src/framework/view.js';
cl.measure(MeasureSpec.makeMeasureSpec(360,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(720,MeasureSpec.EXACTLY));
console.log('CL w/h=',cl.getWidth(),cl.getHeight());
for(const ch of cl.children) console.log('  ',(ch.$descriptor||'').split('/').pop(),'w=',ch.getWidth(),'h=',ch.getHeight());
// test addAll manually
const c=clj.$fields.get('Landroidx/coordinatorlayout/widget/CoordinatorLayout;->c:Landroidx/coordinatorlayout/widget/a;');
const r=vm.invoke({classDesc:'Landroidx/coordinatorlayout/widget/a;',name:'b',proto:{descriptor:'()Ljava/util/ArrayList;',parameters:[],returnType:'Ljava/util/ArrayList;'}},c,[],'virtual');
console.log('r items=',r.$peer.items.length,'r===bb?',r===bb);
vm.invoke({classDesc:'Ljava/util/List;',name:'addAll',proto:{descriptor:'(Ljava/util/Collection;)Z',parameters:[],returnType:'Z'}},bb,[r],'interface');
console.log('after manual addAll b=',bb.$peer.items.length);
