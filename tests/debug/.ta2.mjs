import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
const target=0x01010098; // android:textColor
let n=0;
for(const [id,e] of t.entries||new Map()){
  if(!e.bag) continue;
  for(const [aid,val] of e.bag.items||[]){
    if(aid===target && n<12){ console.log('STYLE',id,e.key||'',JSON.stringify(val).slice(0,80)); n++; }
  }
}
