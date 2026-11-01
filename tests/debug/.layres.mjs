import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);
canvas.style={}; canvas.clientWidth=360; canvas.clientHeight=720;
canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
try{await eng.start(apk);}catch(e){}
await new Promise(r=>setTimeout(r,400));
const vm=eng.vm;
for (const c of ['Landroid/widget/TableRow;','Landroid/view/View;','Landroidx/recyclerview/widget/RecyclerView$p;']) {
  const r=vm.findVirtual(c,'layout','(IIII)V');
  console.log(c.split('/').pop().replace(';','')+'.layout =>', r? (r.kind+':'+(r.method?.classDesc||'')):'NULL');
}
function find(v,name){if(!v)return null;const t=(v.$descriptor||v.$nativeClass||'');if(t.includes(name))return v;for(const c of v.children||[]){const r=find(c,name);if(r)return r;}return null;}
const rv=find(eng.screen?.decorView,'RecyclerView');
const jo=rv?.$javaObject;
const ch0=jo?.$fields.get('Landroidx/recyclerview/widget/RecyclerView;->h0:Landroidx/recyclerview/widget/RecyclerView$a0;');
console.log('adapter=', !!ch0);
const adp = jo?.$fields.get('Landroidx/recyclerview/widget/RecyclerView;->h0:Landroidx/recyclerview/widget/RecyclerView$a0;');
console.log('adp dex=', adp?.$dexClass?.descriptor, 'peer=', adp?.$peer?.constructor?.name);
if (adp) for (const [k,v] of (adp.$fields||new Map())) console.log('  A', k.split('->')[1], '=', (v&&typeof v==='object')?(v.$descriptor||v.$nativeClass||'obj'):v);
