import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
const vm=eng.vm;
const act=vm.activity;
if(!act){console.log('no activity');process.exit(0);}
// find NavigationView field E on activity
let nav=null;
for(const [k,v] of act.$fields) if(k.includes('NavigationView')) nav=v;
console.log('nav?', !!nav, 'desc', nav?.$dexClass?.descriptor);
if(nav){
  for(const [k,v] of nav.$fields) console.log('  fld', k, v==null?'null':(v.$dexClass?.descriptor||typeof v));
}
if(nav){
  let h=null; for(const [k,v] of nav.$fields) if(k.endsWith('NavigationView;->h:Lcom/google/android/material/internal/h;')) h=v;
  console.log('h desc', h?.$dexClass?.descriptor);
  for(const [k,v] of h.$fields) console.log('  hfld', k, v==null?'null':(v.$dexClass?.descriptor||(v.$data?'array':'val')||typeof v));
}
if(nav){
  let h=null; for(const [k,v] of nav.$fields) if(k.endsWith('NavigationView;->h:Lcom/google/android/material/internal/h;')) h=v;
  let c=null; for(const [k,v] of h.$fields) if(k.endsWith('internal/h;->c:Landroid/widget/LinearLayout;')) c=v;
  console.log('c keys', c && Object.keys(c).slice(0,8));
  console.log('c native', c?.$nativeClass, 'view?', !!c?.$view, 'children', c?.$view?.children?.length);
}
