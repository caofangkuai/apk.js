import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const {parseBinaryXml, typedValueToString}=await import('./src/res/axml.js');
const z=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
for(const f of ['res/layout/fragment_item_50.xml','res/layout/fragment_item_sel.xml','res/layout/fragment_item.xml']){
  try{
    const b=await z.file(f).async('uint8array');
    const r=parseBinaryXml(b);
    const root=r.first;
    console.log('==',f);
    function walk(n,d){console.log(' '.repeat(d)+n.name,JSON.stringify((n.attrs||[]).map(a=>[a.name,typedValueToString(a.value)])));(n.children||[]).forEach(c=>walk(c,d+1));}
    walk(root,0);
  }catch(e){console.log(f,'ERR',e.message)}
}
