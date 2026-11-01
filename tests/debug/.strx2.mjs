import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
const e=t.variants.get(0x7f1100ba);
console.log('variants',e?.length);
for(const v of e||[]) console.log(JSON.stringify(v.value),'lang='+(v.config?.language||'')+' c='+(v.config?.country||''));
console.log("key=", t.entries.get(0x7f1100ba)?.key);
for(const [id,vars] of t.variants){for(const v of vars){if(String(v.value)==='SCREEN')console.log('0x'+id.toString(16),v.config?.language);}}
