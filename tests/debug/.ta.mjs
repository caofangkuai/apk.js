import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
for(const id of [0x7f0400b6,0x7f0400b7,0x7f060038,0x7f060039]){
  const e=t.entries?.get?.(id)||t.get?.(id);
  console.log('0x'+id.toString(16), e?e.typeName+' '+e.key+' '+JSON.stringify(e.value):'MISSING');
}
