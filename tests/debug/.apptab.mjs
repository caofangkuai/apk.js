import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
// find any style bag with attr 0x7f0402fd (tabSelectedTextColor)
const target=0x7f0402fd;
for(const [id,e] of t.entries||new Map()){
  if(!e.bag) continue;
  for(const [aid,val] of e.bag.items||[]){
    if(aid===target) console.log('STYLE',id,e.key||e.typeName,JSON.stringify(val));
  }
}
