import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const { parseBinaryXml } = await import('./src/res/axml.js');
for(const n of ['res/color/mtrl_tabs_colored_ripple_color.xml']){
  const buf=await zip.file(n).async('nodebuffer');
  const x=parseBinaryXml(buf);
  function walk(node,d){ if(node.type==='element'){ console.log(' '.repeat(d)+node.name, JSON.stringify((node.attrs||[]).map(a=>[a.name, typeof a.value==='object'?JSON.stringify(a.value):a.value]))); } for(const c of node.children||[]) walk(c,d+1); }
  walk(x.root,0);
}
