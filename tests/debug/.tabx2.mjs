import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
// tabSelectedTextColor attr 0x7f0402fd ; look in Widget.MaterialComponents.TabLayout.Colored style 2131886793? 
for(const id of [2131099865]){const e=t.entries?.get?.(id)||t.get?.(id);console.log('RES 0x'+id.toString(16),e?e.typeName+' '+e.key+' '+JSON.stringify(e.value).slice(0,80):'MISS');}
for(const sid of [2131886305,2131886792,2131886793]){
  const attrs=t.getStyleAttributes(sid);
  if(!attrs) continue;
  for(const [aid,val] of attrs){
    if(aid===0x7f0402fd||aid===0x7f0402fc||aid===0x7f0402fb){
      console.log('style',sid,'attr 0x'+aid.toString(16), JSON.stringify(val).slice(0,120));
    }
  }
}
