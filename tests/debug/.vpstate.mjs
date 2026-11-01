globalThis.__DBG_MTS=1;
globalThis.__DBG_ARG=1;
globalThis.__DBG_GR=0;
globalThis.__DBG_FR=0;
globalThis.DBG_AVIL=1;
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import Canvas from 'canvas';
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const canvas=Canvas.createCanvas(360,720);
canvas.style={};canvas.clientWidth=360;canvas.clientHeight=720;
canvas.addEventListener=()=>{};canvas.removeEventListener=()=>{};canvas.setPointerCapture=()=>{};
canvas.getBoundingClientRect=()=>({left:0,top:0,width:360,height:720});
import {JavaVM} from './src/runtime/vm.js';
const origInv=JavaVM.prototype.invoke;
JavaVM.prototype.invoke=function(ref,recv,args,mode,method){
  try{
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='a'&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(II)')===0){
      console.log('VP.addNewItem pos=',args[0],'idx=',args[1]);
    }
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='a'&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroidx/viewpager/widget/ViewPager$f;I')>=0){
      console.log('VP.addNewItemView item=',!!args[0],'idx=',args[1]);
    }
    if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='n'){
      console.log('FM.moveToState fragState=',args[1]);
    }
    if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='a'&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroidx/fragment/app/Fragment;Z)')===0){
      console.log('FM.addFragment frag=',args[0]&&args[0].$dexClass&&args[0].$dexClass.descriptor, 'moving=',args[1]);
    }
    if(ref.classDesc==='Landroidx/fragment/app/Fragment;'&&(ref.name==='a'||ref.name==='e')&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroid/view/LayoutInflater')>=0){
      const r=origInv.apply(this,arguments);
      console.log('FR.onCreateView frag=',recv&&recv.$dexClass&&recv.$dexClass.descriptor,'ret=',r===null?'null':(r&&(r.$dexClass?r.$dexClass.descriptor:r.$nativeClass))||typeof r);
      return r;
    }
    if(ref.classDesc==='Landroid/view/ViewGroup;'&&(ref.name==='addView'||ref.name==='addViewInLayout')){
      const st=(this.methodStack||[]).join('<');
      if(recv&&(recv.$dexClass?recv.$dexClass.descriptor:recv.$nativeClass)==='Landroidx/viewpager/widget/ViewPager;'){
        console.log('VG.'+ref.name,'parent=',recv&&(recv.$dexClass?recv.$dexClass.descriptor:recv.$nativeClass),'child=',args[0]&&(args[0].$dexClass?args[0].$dexClass.descriptor:args[0].$nativeClass));
      }
    }
    if(ref.classDesc==='Landroidx/fragment/app/Fragment;'&&(ref.name==='b')&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;')>=0){
      console.log('FR.makeView container=',args[1]&&(args[1].$dexClass?args[1].$dexClass.descriptor:args[1].$nativeClass||typeof args[1]),'mContainer=',(()=>{try{return this.getField(recv,{classDesc:'Landroidx/fragment/app/Fragment;',name:'G',type:'Landroid/view/ViewGroup;'})}catch(e){return 'e'}})());
    }
    if(ref.classDesc==='Landroidx/fragment/app/Fragment;'&&ref.name==='b'&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;')>=0&&!this.__probeBusy){
      this.__probeBusy=1; let r; try{ r=origInv.apply(this,arguments); } finally { this.__probeBusy=0; }
      const mv=this.getField(recv,{classDesc:'Landroidx/fragment/app/Fragment;',name:'H',type:'Landroid/view/View;'});
      console.log('FR.makeView done mView=',mv===null?'null':(mv&&(mv.$dexClass?mv.$dexClass.descriptor:mv.$nativeClass))||typeof mv,'ret=',r===null?'null':typeof r);
      return r;
    }
    if(ref.classDesc==='Landroidx/fragment/app/Fragment;'&&ref.name==='a'&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroid/view/LayoutInflater')>=0&&!(ref.proto.text||ref.proto.descriptor).startsWith('(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)V')){
      try{ const r=origInv.apply(this,arguments); console.log('PERFCV ret=',r===null?'null':(r&&(r.$dexClass?r.$dexClass.descriptor:r.$nativeClass)||typeof r)); return r; }
      catch(e){ console.log('PERFCV THROW',e.message); throw e; }
    }
    if(ref.classDesc==='Landroidx/fragment/app/Fragment;'&&ref.name==='b'&&ref.proto&&(ref.proto.text||ref.proto.descriptor||'').indexOf('(Landroid/view/LayoutInflater')>=0){
      console.log('MKV frag flags: isJavaObj=', !!recv[Object.getOwnPropertySymbols(recv).find(s=>String(s).indexOf('javaObject')>=0)], 'hasFields=', !!(recv&&recv.$fields), 'peer=', !!recv.$peer);
    }
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='addView'){
      console.log('VP.addView proto=',ref.proto&&(ref.proto.text||ref.proto.descriptor),'arg0=',args[0]&&(args[0].$dexClass?args[0].$dexClass.descriptor:args[0].$nativeClass||typeof args[0]),'st='+(this.methodStack||[]).slice(-5).join('<'));
    }
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&(ref.name==='c'||ref.name==='e')){
      try{
        const cnt=this.invoke({classDesc:'Landroidx/viewpager/widget/a;',name:'a',proto:{descriptor:'()I',parameters:[],returnType:'I'}},this.getField(recv,{classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'f',type:'Landroidx/viewpager/widget/a;'}),[],'virtual');
        console.log('  counts adapterCount=',cnt,'mExpected=',this.getField(recv,{classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'b',type:'I'}),'curItem=',this.getField(recv,{classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'g',type:'I'}));
      }catch(e){console.log('  countErr',e.message);}
      console.log('VP.'+ref.name+' enter items=',(()=>{try{const it=this.getField(recv,{classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'c',type:'Ljava/util/ArrayList;'});return it&&it.items?it.items.length:(it==null?'null':'?')}catch(e){return 'e'}})());
    }
    if(ref.classDesc==='Landroid/view/ViewGroup;'&&(ref.name==='addView')){
      const st=(this.methodStack||[]).slice(-6).join('<');
      if(st.indexOf('ViewPager')>=0) console.log('ADDVIEW',ref.proto&&(ref.proto.text||ref.proto.descriptor),'vpChild='+(args[0]&&(args[0].$dexClass?args[0].$dexClass.descriptor:args[0].$nativeClass)),'st='+st);
    }
    if(ref.classDesc==='Landroid/view/ViewGroup;'&&(ref.name==='removeView'||ref.name==='removeViewAt')){
      const st=(this.methodStack||[]).slice(-6).join('<');
      if(st.indexOf('ViewPager')>=0) console.log('REMVIEW',ref.name,'st='+st);
    }
  }catch(e){}
  return origInv.apply(this,arguments);
};

const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2]||'/tmp/devinfo.apk')));
try{await eng.start(apk);}catch(e){console.log('START',e.message);}
await new Promise(r=>setTimeout(r,600));
const vm=eng.vm;
function walk(v,d=0){ if(!v||d>25)return; const n=(v.$descriptor||v.$nativeClass||'?').split('/').pop().replace(';','');
  if(/ViewPager|TabLayout/.test(n)){
    const p=v.$peer||{};
    const jo=v.$javaObject||v;
    let ad=null,it=null;
    try{ ad=vm.getField(jo,{classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'f',type:'Landroidx/viewpager/widget/a;'}); }catch(e){ad='ERR';}
    try{ it=vm.getField(jo,{classDesc:'Landroidx/viewpager/widget/ViewPager;',name:'c',type:'Ljava/util/ArrayList;'}); }catch(e){it='ERR';}
    console.log('   getField adapter=',ad===null?'null':(typeof ad),' items=',it&&it.items?it.items.length:(it===null?'null':'?'),' hasJavaObj=',!!v.$javaObject);
    console.log(n,'id='+v.id,'children='+(v.children||[]).length,'adapter='+(p.adapter?'yes':'no'),
      'items='+(()=>{try{const it=p.mItems||(p.$fields&&p.$fields.get&&p.$fields.get('mItems'));return Array.isArray(it)?it.length:(it&&it.items?it.items.length:'?')}catch(e){return 'err'}})(),
      'pages='+(p.mAdapter?'?':'none'));
  }
  for(const c of (v.children||[])) walk(c,d+1);
}
walk(eng.screen.decorView);
console.log('SETFIELD CALLS =', globalThis.__SETN, 'GSEEN =', globalThis.__GSEEN);
