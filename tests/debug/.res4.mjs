import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
for(const id of [2131099723,2131099724,2131099725,2130968774]){
  const e=t.resolve(id>>>0);
  const entry=t.getEntry(id>>>0);
  console.log('0x'+id.toString(16), entry&&entry.typeName, entry&&entry.key, '=>', typeof e==='object'?JSON.stringify(e):e);
}
