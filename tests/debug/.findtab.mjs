import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const { parseBinaryXml } = await import('./src/res/axml.js');
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
for(const id of ['res/layout/activity_main.xml','res/layout/fragment_main.xml']){
  const f=zip.file(id); if(!f) { console.log('MISS',id); continue; }
  const x=parseBinaryXml(await f.async('nodebuffer'));
  function walk(n,d){ if(n.type==='element'){ if(/TabLayout|Toolbar|AppBar/.test(n.name)) console.log(id+' '+n.name, JSON.stringify((n.attrs||[]).map(a=>a.name+'='+(typeof a.value==='object'?JSON.stringify(a.value):a.value)))); } for(const c of n.children||[])walk(c,d+1);}
  walk(x.root,0);
}
