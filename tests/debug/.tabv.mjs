import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
for(const id of [2130969341,2130969339,2130969340]){
  const e=t.entries?.get?.(id)||t.get?.(id);
  console.log('0x'+id.toString(16), e?e.typeName+' '+e.key+' '+JSON.stringify(e.value).slice(0,80):'MISSING');
}
