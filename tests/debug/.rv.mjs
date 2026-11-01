globalThis.__RV7=1;
globalThis.__RV6=1;
globalThis.__RV5=1;
globalThis.__MS4=1;
globalThis.__DBG_RVLM=1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); const JSZip=require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from '/workspace/src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720); canvas.style={}; canvas.clientWidth=360; canvas.clientHeight=720;
canvas.addEventListener=()=>{}; canvas.removeEventListener=()=>{}; canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720}); eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,500));
const vm=eng.vm;
function find(v,p){if(!v)return null;if(p(v))return v;for(const c of v.children||[]){const r=find(c,p);if(r)return r;}return null;}
const rv=find(eng.screen.decorView,v=>/RecyclerView/.test(v.$descriptor||''));
console.log('RV', !!rv, rv&&rv.getWidth()+'x'+rv.getHeight());
const obj=rv.$javaObject;
console.log('OBJ desc=', obj&&obj.$descriptor, 'fields=', obj&&obj.$fields&&obj.$fields.size, 'nativeClass=', obj&&obj.$nativeClass);
if(obj&&obj.$fields){ let n=0; for(const [k,v] of obj.$fields){ if(n++<25) console.log('  F', k); } }
const g=(n)=>obj.$fields.get('Landroidx/recyclerview/widget/RecyclerView;->'+n);
const ad=g('l:Landroidx/recyclerview/widget/RecyclerView$g;');
const lm=g('m:Landroidx/recyclerview/widget/RecyclerView$o;');
console.log('ADAPTER', ad? 'obj':'null', ad&&[...ad.$fields.keys()].slice(0,8).join('|'));
if(ad){ try{ const n=vm.invokeByName('getItemCount','()I',ad,[],'virtual'); console.log('ITEMCOUNT', n); }catch(e){ console.log('IC_ERR', e.message); } }
console.log('LM', lm?'obj':'null', lm&&[...lm.$fields.keys()].slice(0,10).join('|'));
try{ const n=vm.invokeByName('getItemCount','()I',rv.$javaObject,[],'virtual'); console.log('RV_IC', n); }catch(e){ console.log('RVIC_ERR', e.message); }
console.log('ADCLASS', ad.$nativeClass||ad.$dexClass?.descriptor);
const ks=[...ad.$fields.keys()].filter(k=>!/RecyclerView\$x->/.test(k));
console.log('ADFIELDS', ks.join('\n  '));
for(const k of ks){ const v=ad.$fields.get(k); console.log('  AV', k, '=', v && v.$nativeClass ? 'obj:'+v.$nativeClass : (v && v.$peer ? 'peer' : String(v))); }
const lst=g('l:Landroidx/recyclerview/widget/RecyclerView$g;');
const dl=ad.$fields.get('Lru/andr7e/deviceinfohw/l/c;->d:Ljava/util/List;');
console.log('DLIST peer=', !!dl.$peer, 'items=', dl.$peer?.items?.length, 'arr=', Array.isArray(dl.$peer?.items));
if(Array.isArray(dl.$peer?.items)) for(const it of dl.$peer.items.slice(0,3)) console.log('  IT', it && it.$nativeClass, it && it.$peer ? 'peer' : String(it));
const el=ad.$fields.get('Lru/andr7e/deviceinfohw/l/c;->e:Ljava/util/List;');
console.log('ELIST', el===null?'null':(el&&el.$peer?'peer':'other'));
try{ const n=vm.invoke({classDesc:'Lru/andr7e/deviceinfohw/l/c;',name:'a',proto:{descriptor:'()I',parameters:[],returnType:'I'}}, ad, [], 'virtual'); console.log('DEX_COUNT', n); }catch(e){ console.log('DEXC_ERR', e.message, e.stack&&e.stack.split('\n')[1]); }
try{ const lm2=vm.invoke({classDesc:'Landroidx/recyclerview/widget/RecyclerView;',name:'getItemCount',proto:{descriptor:'()I',parameters:[],returnType:'I'}}, rv.$javaObject, [], 'virtual'); console.log('RV_COUNT_DEX', lm2); }catch(e){ console.log('RVC_ERR', e.message); }
console.log('RVMEAS', rv.measuredWidth, rv.measuredHeight, 'kids=', rv.children.length, 'lp=', JSON.stringify(rv.layoutParams));
for(const c of rv.children){ console.log('  KID', (c.$descriptor||'?'), c.left, c.top, c.getWidth()+'x'+c.getHeight()); }
const st=rv.$javaObject.$fields.get('Landroidx/recyclerview/widget/RecyclerView;->h0:Landroidx/recyclerview/widget/RecyclerView$a0;');
console.log('STATE', st?'obj':'null', st&&[...st.$fields.keys()].join('|'));
if(st){ for(const [k,v] of st.$fields) if(/->[a-z]+:I$/.test(k)) console.log('  SF', k, '=', v); }
const lm0=rv.$javaObject.$fields.get('Landroidx/recyclerview/widget/RecyclerView;->m:Landroidx/recyclerview/widget/RecyclerView$o;');
console.log('LMCLASS2', lm0.$dexClass&&lm0.$dexClass.descriptor, 'nc=', lm0.$nativeClass, 'fields=', lm0.$fields&&lm0.$fields.size);
for(const [k,v] of lm0.$fields){ console.log('  LF', k, '=', typeof v==='number'? v : (v&&(v.$dexClass&&v.$dexClass.descriptor))||String(v)); }
const chain=[]; let p0=rv; while(p0){ chain.unshift(p0); p0=p0.parent; }
for(const c of chain) console.log('CH', (c.$descriptor||c.constructor.name||'?').split('/').pop(), 'meas=' + c.measuredWidth + 'x' + c.measuredHeight, 'rect=' + c.left+','+c.top+','+c.right+','+c.bottom, 'lp=' + JSON.stringify(c.layoutParams&&{w:c.layoutParams.width,h:c.layoutParams.height}));
const dk = vm.registry.resolve('Landroidx/recyclerview/widget/RecyclerView;');
console.log('DEX resolved=', !!dk, dk&&dk.dexClass&&dk.dexClass.descriptor, 'methods=', dk&&dk.dexClass&&(dk.dexClass.virtualMethods||[]).length);
