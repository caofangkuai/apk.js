import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
for(const id of [0x7f100005,0x7f100006,0x7f100007,0x7f0f0000]){
}
// 2130968581 = 0x7f0d0005
for(const id of [0x7f0d0005]){
  const e=t.entries?.get?.(id)||t.get?.(id);
  console.log('0x'+id.toString(16), JSON.stringify(e));
}
