import fs from 'node:fs';
globalThis.__DBG_ADDED=1;globalThis.__DBG_D=1;
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
import { JavaVM } from './src/runtime/vm.js';
const ctx=new Proxy({measureText:t=>({width:8}),getLineDash:()=>[]},{get(t,p){return p in t?t[p]:()=>{}},set(t,p,v){t[p]=v;return true}});
const canvas={clientWidth:360,clientHeight:720,width:360,height:720,style:{},getContext:()=>ctx,addEventListener(){},getBoundingClientRect(){return{left:0,top:0,width:360,height:720}}};
globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(0),16);
let n=0;
const origInvoke=JavaVM.prototype.invoke;
let callN=0; const ids=new Map(); let nx=1; function oid(o){if(!o||typeof o!=='object')return String(o); if(!ids.has(o))ids.set(o,nx++); return ids.get(o);}
function pn(ref){const p=ref.proto; if(!p) return ''; return p.text||p.raw||(p.descriptor||'');}
JavaVM.prototype.invoke=function(ref,recv,args,mode,method){
  try{
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='getClientWidth'){
      const w=this.getField(recv,{classDesc:'Landroid/view/View;',name:'mMeasuredWidth',type:'I'});
      const pl=this.getField(recv,{classDesc:'Landroid/view/View;',name:'mPaddingLeft',type:'I'});
      const pr=this.getField(recv,{classDesc:'Landroid/view/View;',name:'mPaddingRight',type:'I'});
      console.error('CLIENTW width=',w,'jsMW=',recv&&recv.$view?recv.$view.measuredWidth:'noview','jsMWState=',recv&&recv.$view?recv.$view.measuredWidthState:'-','peerView=',recv&&recv.$peer?(recv.$peer.view===recv.$view?'same':'diff'):'nopeer');
    }
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&['onMeasure','e','c'].includes(ref.name)){
      callN++;
      console.error('VP#'+callN,ref.name+pn(ref),'vp='+oid(recv)+' MS='+(this.methodStack||[]).join('>>'));
    }
    if(ref.classDesc==='Landroidx/viewpager/widget/ViewPager;'&&ref.name==='a'&&pn(ref)==='(II)Landroidx/viewpager/widget/ViewPager$f;'){
      console.error('ADDITEM','vp='+oid(recv),'pos='+args[0],'mCurState=',recv&&recv.$fields&&recv.$fields.get?recv.$fields.get('mCurState'):'?');
    }
    if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='a'&&pn(ref)==='(Landroidx/fragment/app/a;Z)V'){
      console.error('  ENQ rec=',oid(args[0]),'stack=',(this.methodStack||[]).slice(-4).join(' < '));
    }
    if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='a'&&pn(ref)==='(Landroidx/fragment/app/Fragment;Z)V'){
      const f=args&&args[0];
      try{console.error('  ADDFRAG-STACK', (this.methodStack||[]).slice(-8).join(' < '));}catch(e){}
      try{console.error('  ADDFRAG-in mAdded=',this.getField(f,{classDesc:'Landroidx/fragment/app/Fragment;',name:'mAdded',type:'Z'}),'oid=',oid(f),'arg1=',args[1]);}catch(e){console.error('  ADDFRAG-in ERR',e.message);}
      console.error('ADDFRAG','frag='+oid(args[0]),'added='+(args[0]&&args[0].$fields&&args[0].$fields.get?args[0].$fields.get('mAdded'):'?'));
    }
    if(ref.classDesc==='Landroidx/fragment/app/o;'&&ref.name==='a'&&pn(ref)==='(Landroid/view/ViewGroup;I)Ljava/lang/Object;'){
      console.error('INSTANTIATE','adapter='+oid(recv),'pos='+args[1]);
    }
    if(ref.classDesc==='Landroidx/fragment/app/o;'&&pn(ref)==='(Landroid/view/ViewGroup;)V'){
      const d=recv&&recv.$fields&&recv.$fields.get?recv.$fields.get('mCurTransaction'):undefined;
      console.error('ADAPTER_'+(ref.name==='a'?'FINISH':'B_OTHER'),'adapter='+oid(recv),'mCurTx='+String(d&&typeof d==='object'?oid(d):d));
    }
    if(ref.classDesc==='Landroidx/viewpager/widget/a;'){
      console.error('PAGERADAPTER',ref.name+pn(ref),'impl='+(recv&&recv.$dexClass?recv.$dexClass.descriptor:'?'));
      if(['(Landroid/view/ViewGroup;I)Ljava/lang/Object;','(Landroid/view/ViewGroup;)V','(Landroid/view/ViewGroup;ILjava/lang/Object;)V'].includes(pn(ref)) && ref.classDesc==='Landroidx/fragment/app/o;'){
        try{ const v=this.getField(recv,{classDesc:'Landroidx/fragment/app/o;',name:'d',type:'Landroidx/fragment/app/p;'});
          console.error('  mCurTx=', v===null?'null':v===undefined?'undef':(typeof v)+':'+(v&&v.$dexClass?v.$dexClass.descriptor:''),'keys=',[...(recv.$fields?recv.$fields.keys():[])].filter(k=>k.includes('Transaction')).join('|'));
        }catch(e){console.error('  mCurTx ERR',e.message);}
      }
    }
    if(ref.classDesc==='Landroidx/fragment/app/a;'&&ref.name==='c'&&pn(ref)==='()V'){
      console.error('EXECUTE rec='+oid(recv),'ops='+(recv&&recv.$fields&&recv.$fields.get?String(recv.$fields.get('mOps')):'?'),'caller='+(method?method.classDesc+'.'+method.name:'?'));
    }
    if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='b'&&pn(ref)==='(Ljava/util/ArrayList;Ljava/util/ArrayList;)Z'){
      const d=recv&&recv.$fields&&recv.$fields.get?recv.$fields.get('mPendingActions'):null;
      let info='?'; try{ info = d && d.items ? d.items.length : (d? 'nopeer': 'undef'); }catch(e){info='err'}
      console.error('JB_PENDING dlen='+info, 'A0='+oid(args[0]), 'A0len='+(args[0]&&args[0].items?args[0].items.length:'?'));
    }
    if(ref.classDesc==='Landroidx/fragment/app/j;'&&ref.name==='a'&&pn(ref)==='(Landroidx/fragment/app/j$k;Z)V'){
      console.error('ENQUEUE op='+oid(args[0]));
    }
  }catch(e){}
  return origInvoke.call(this,ref,recv,args,mode,method);
};
function pcMaybe(vm){return vm.currentPc;}
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});eng.attachCanvas(canvas);
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk).catch(e=>console.log('START',e.message));
