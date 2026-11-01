import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
for(const [id,vars] of t.variants){
  for(const v of vars){
    if(String(v.value)==='SCREEN'||String(v.value)==='屏幕'){
      console.log('0x'+id.toString(16),'val='+v.value,'lang='+(v.config?.language||'')+' country='+(v.config?.country||''));
    }
  }
}
